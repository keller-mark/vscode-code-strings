// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as vscodeTextmate from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import { parse as parsePlist } from 'plist';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { start } from 'repl';


interface GrammarCache {
  [language: string]: any;
}

interface Token {
  type: string;
  value: string;
  range: vscode.Range; // Added range for decoration
}

interface SyntaxDecoration {
  range: vscode.Range;
  type: string;
}

class DynamicSyntaxHighlighter {
  private grammarCache: GrammarCache = {};
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private disposables: vscode.Disposable[] = [];
  
  // Dynamic color mapping for token types
  private tokenTypeColors: Map<string, string> = new Map();
  private colorPalette: string[] = [
    '#569cd6', // blue
    '#ce9178', // orange
    '#6a9955', // green
    '#b5cea8', // light green
    '#4fc1ff', // cyan
    '#dcdcaa', // yellow
    '#c586c0', // purple
    '#9cdcfe', // light blue
    '#f44747', // red
    '#d7ba7d', // tan
    '#b267e6', // violet
    '#ffb86c', // peach
    '#50fa7b', // mint
    '#ff79c6', // pink
    '#8be9fd', // sky
    '#bd93f9', // lavender
    '#f8f8f2', // white
    '#6272a4', // indigo
    '#44475a', // dark
    '#dcdcdc'  // fallback
  ];
  private colorIndex: number = 0;

  private static readonly SUPPORTED_PARENT_LANGUAGES = [
    'python', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact'
  ];

  constructor(private context: vscode.ExtensionContext) {}

  async activate() {
    // Listen for document changes
    const changeDocumentDisposable = vscode.workspace.onDidChangeTextDocument(
      (event) => this.handleDocumentChange(event)
    );

    // Listen for active editor changes
    const changeActiveEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
      (editor) => this.handleActiveEditorChange(editor)
    );

    this.disposables.push(changeDocumentDisposable, changeActiveEditorDisposable);

    // Process current active editor
    if (vscode.window.activeTextEditor) {
      await this.processDocument(vscode.window.activeTextEditor.document);
    }
  }

  private async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    if (event.document === vscode.window.activeTextEditor?.document) {
      await this.processDocument(event.document);
    }
  }

  private async handleActiveEditorChange(editor: vscode.TextEditor | undefined) {
    if (editor) {
      await this.processDocument(editor.document);
    }
  }

  private async processDocument(document: vscode.TextDocument) {
    // Only process supported parent languages
    if (!DynamicSyntaxHighlighter.SUPPORTED_PARENT_LANGUAGES.includes(document.languageId)) {
      return;
    }
    const text = document.getText();
    const lines = text.split('\n');
    const decorationsByType: Map<string, vscode.DecorationOptions[]> = new Map();

    // Determine comment syntax based on parent language
    let commentRegex: RegExp;
    if (document.languageId === 'python') {
      commentRegex = /^\s*#\s*lang:\s*(\w+)/;
    } else {
      // Default to JS/TS style
      commentRegex = /^\s*\/\/\s*lang:\s*(\w+)/;
    }

    let prevEndLine: number | undefined = undefined;

    for (let i = 0; i < lines.length; i++) {
      if(prevEndLine !== undefined && i <= prevEndLine) {
        // Skip ahead in the for loop past endLine.
        continue;
      }
      const line = lines[i];
      const commentMatch = line.match(commentRegex);
      
      if (commentMatch) {
        const targetLanguage = commentMatch[1].toLowerCase();
        console.log(`Found comment directive for language: ${targetLanguage} at line ${i + 1}`);
        
        // Find the next string literal, using parent language
        const stringMatch = this.findStringLiteral(lines, i + 1, document.languageId);
        if (stringMatch) {
          const { startLine, startLineOffset, endLine, contentLines } = stringMatch;
          console.log(`Found string literal from line ${startLine} to ${endLine} for language: ${targetLanguage}`);
          
          // Apply syntax highlighting based on the target language
          const syntaxDecorations = await this.applySyntaxHighlighting(
            document,
            startLine,
            startLineOffset,
            endLine,
            contentLines,
            targetLanguage
          );
          prevEndLine = endLine;
          console.log(`Decorations: `, syntaxDecorations);
          
          // Group decorations by type
          syntaxDecorations.forEach(decoration => {
            const type = decoration.type;
            if (!decorationsByType.has(type)) {
              decorationsByType.set(type, []);
            }
            decorationsByType.get(type)!.push({ range: decoration.range });
          });

          //console.log(`DecorationsByType`, decorationsByType);
        }
      }
    }

    // Apply decorations
    if (vscode.window.activeTextEditor && decorationsByType.size > 0) {
      // Clear existing decorations
      this.decorationTypes.forEach(decorationType => {
        vscode.window.activeTextEditor!.setDecorations(decorationType, []);
      });
      
      // Apply new decorations grouped by type
      decorationsByType.forEach((decorations, type) => {
        const decorationType = this.getOrCreateDecorationType(type);
        vscode.window.activeTextEditor!.setDecorations(decorationType, decorations);
      });
    }
  }

  private findStringLiteral(
    lines: string[],
    fromLine: number,
    parentLanguageId: string
  ): { startLine: number; startLineOffset: number; endLine: number; contentLines: string[] } | null {

    let startLine: number | undefined = undefined;
    let startLineOffset: number | undefined = undefined;
    let endLine: number | undefined = undefined;
    let contentLines: string[] = [];
    let firstQuoteType: string | undefined = undefined;
    
    for (let i = fromLine; i < lines.length; i++) {
      const line = lines[i];
      if (parentLanguageId === 'python') {
        const tripleQuoteMatch = line.match(/^(.*)(["']{3})(.*)$/);
        // Entry 0: full match
        // Entry 1: before triple quotes
        // Entry 2: triple quotes
        // Entry 3: after triple quotes
        if (tripleQuoteMatch) {
          console.log(tripleQuoteMatch)
          const quoteType = tripleQuoteMatch[2];
          console.log(`Found triple-quoted string at line ${i + 1} with quote type: ${quoteType}`);
          if(typeof startLine === 'number' && typeof startLineOffset === 'number') {
            if (firstQuoteType === quoteType) {
              // Final line
              contentLines.push(tripleQuoteMatch[1]);
              endLine = i;
              return { startLine, startLineOffset, endLine, contentLines };
            } else {
              console.error(`Mismatched quote type at line ${i + 1}: expected ${firstQuoteType}, found ${quoteType}`);
            }
          } else {
            // First line
            firstQuoteType = quoteType;
            startLine = i;
            startLineOffset = tripleQuoteMatch[1].length + quoteType.length;
            contentLines.push(tripleQuoteMatch[3]);
          }
        } else {
          // Middle line
          contentLines.push(line);
        }
      } else if (
        parentLanguageId === 'javascript' ||
        parentLanguageId === 'typescript' ||
        parentLanguageId === 'javascriptreact' ||
        parentLanguageId === 'typescriptreact'
      ) {
        const templateMatch = line.match(/^(.*)`(.*)$/);
        // Entry 0: full match
        // Entry 1: before template literal
        // Entry 2: after template literal
        if (templateMatch) {
          console.log('Found template literal at line', i + 1);
          if (typeof startLine === 'number' && typeof startLineOffset === 'number') {
            // Final line
            contentLines.push(templateMatch[1]);
            endLine = i;
            return { startLine, startLineOffset, endLine, contentLines };
          } else {
            // First line
            startLine = i;
            startLineOffset = templateMatch[1].length;
            contentLines.push(templateMatch[2]);
          }
        } else {
          // Middle line
          contentLines.push(line);
        }
      }
    }
    return null;
  }

  private async applySyntaxHighlighting(
    document: vscode.TextDocument,
    startLine: number,
    startLineOffset: number,
    endLine: number,
    contentLines: string[],
    language: string
  ): Promise<SyntaxDecoration[]> {
    const decorations: SyntaxDecoration[] = [];
    // Fetch grammar dynamically for supported child languages
    const grammar = await this.fetchGrammar(language);
    let tokens: Token[] = [];
    if (grammar) {
      console.log(`Found content`, contentLines.join('\n'));
      tokens = this.tokenizeWithGrammar(contentLines, grammar, startLine, startLineOffset);
    } else {
      console.error(`No grammar found for language: ${language}`);
    }
    for (const token of tokens) {
      decorations.push({
        range: token.range,
        type: token.type
      });
    }
    console.log(`Applied ${decorations.length} syntax decorations for language: ${language}`);
    return decorations;
  }

  private async fetchGrammar(language: string): Promise<vscodeTextmate.IGrammar | null> {
    // Only support dynamic fetching for JavaScript and GLSL
    const urls: { [key: string]: string } = {
      javascript: 'https://raw.githubusercontent.com/microsoft/TypeScript-TmLanguage/refs/heads/master/TypeScriptReact.tmLanguage',
      js: 'https://raw.githubusercontent.com/microsoft/TypeScript-TmLanguage/refs/heads/master/TypeScriptReact.tmLanguage',
      py: 'https://raw.githubusercontent.com/MagicStack/MagicPython/refs/heads/master/grammars/MagicPython.tmLanguage',
      python: 'https://raw.githubusercontent.com/MagicStack/MagicPython/refs/heads/master/grammars/MagicPython.tmLanguage',
      glsl: 'https://raw.githubusercontent.com/stef-levesque/vscode-shader/refs/heads/master/syntaxes/glsl.tmLanguage',
      css: 'https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/extensions/css/syntaxes/css.tmLanguage.json',
    };
    const url = urls[language];
    if (!url) return null;
    if (this.grammarCache[language]) return this.grammarCache[language];
    try {
      // Fetch the .tmLanguage file as text or the .json file as json
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch grammar for ${language}: ${response.statusText}`);
        return null;
      }
      let rawGrammar: any;
      if(url.endsWith('.json')) {
        rawGrammar = await response.json();
      } else {
        const tmLanguageText = await response.text();
        // Parse the XML .tmLanguage file to JS object using plist
        rawGrammar = parsePlist(tmLanguageText);
      }      
      // Type guard: ensure rawGrammar is an object with scopeName
      if (!rawGrammar || typeof rawGrammar !== 'object' || !('scopeName' in rawGrammar)) {
        console.error(`Invalid grammar format for ${language}`);
        return null;
      }
      // Setup Oniguruma
      const wasmBin = await this.loadOnigWasm();
      const onigLib = {
        createOnigScanner(patterns: string[]) {
          return new oniguruma.OnigScanner(patterns);
        },
        createOnigString(s: string) {
          return new oniguruma.OnigString(s);
        }
      };
      // Create TextMate registry
      const registry = new vscodeTextmate.Registry({
        onigLib: Promise.resolve(onigLib),
        loadGrammar: async () => rawGrammar as unknown as vscodeTextmate.IRawGrammar
      });
      const scopeName = (rawGrammar as any).scopeName;
      const grammar = await registry.loadGrammar(scopeName);
      this.grammarCache[language] = grammar;

      // --- Deterministic tokenType-to-color mapping ---
      const tokenTypes = this.extractTokenTypesFromGrammar(rawGrammar);
      tokenTypes.sort();
      //this.tokenTypeColors.clear();
      for (let i = 0; i < tokenTypes.length; i++) {
        const color = this.colorPalette[i % this.colorPalette.length];
        this.tokenTypeColors.set(tokenTypes[i], color);
      }
      // Always add a fallback
      this.tokenTypeColors.set('default', '#dcdcdc');
      // ---

      return grammar;
    } catch (e) {
      console.error(`Error fetching grammar for ${language}:`, e);
      return null;
    }
  }

  // Recursively extract all unique token types (scopes) from the grammar
  private extractTokenTypesFromGrammar(grammar: any): string[] {
    const types = new Set<string>();
    function visitPattern(pattern: any) {
      if (pattern == null || typeof pattern !== 'object') return;
      if (typeof pattern.name === 'string') types.add(pattern.name);
      if (typeof pattern.contentName === 'string') types.add(pattern.contentName);
      if (Array.isArray(pattern.patterns)) {
        for (const p of pattern.patterns) visitPattern(p);
      }
      if (typeof pattern.repository === 'object') {
        for (const key in pattern.repository) {
          visitPattern(pattern.repository[key]);
        }
      }
      // Sometimes captures and beginCaptures/endCaptures have names
      ['captures', 'beginCaptures', 'endCaptures'].forEach(captureKey => {
        if (pattern[captureKey] && typeof pattern[captureKey] === 'object') {
          for (const cap in pattern[captureKey]) {
            if (pattern[captureKey][cap] && typeof pattern[captureKey][cap].name === 'string') {
              types.add(pattern[captureKey][cap].name);
            }
          }
        }
      });
    }
    visitPattern(grammar);
    return Array.from(types).filter(Boolean);
  }

  private async loadOnigWasm(): Promise<any> {
    // Use the vscode-oniguruma WASM from node_modules
    // This is a workaround for loading the WASM in a VSCode extension
    // You may need to adjust the path depending on your build setup
    const wasmBin = await readFile(join(__dirname, '../node_modules/vscode-oniguruma/release/onig.wasm'));
    return oniguruma.loadWASM(wasmBin)
  }

  private tokenizeWithGrammar(contentLines: string[], grammar: vscodeTextmate.IGrammar, startLine: number, startLineOffset: number): Token[] {
    // Use the TextMate grammar to tokenize the content
    let ruleStack = vscodeTextmate.INITIAL;
    const tokens: Token[] = [];
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const lineTokens = grammar.tokenizeLine(line, ruleStack);
      for (const token of lineTokens.tokens) {
        const type = token.scopes[token.scopes.length - 1] || 'default';
        const { startIndex, endIndex } = token;
        // Adjust startIndex and endIndex based on the startLineOffset
        const adjustedStartIndex = startIndex + (i === 0 ? startLineOffset : 0);
        const adjustedEndIndex = endIndex + (i === 0 ? startLineOffset : 0);
        tokens.push({
          type,
          value: line.slice(startIndex, endIndex),
          range: new vscode.Range(
            new vscode.Position(startLine + i, adjustedStartIndex),
            new vscode.Position(startLine + i, adjustedEndIndex)
          )
        });
      }
      ruleStack = lineTokens.ruleStack;
    }
    return tokens;
  }

  private getOrCreateDecorationType(type: string): vscode.TextEditorDecorationType {
    if (!this.decorationTypes.has(type)) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        color: this.getColorForType(type)
      });
      this.decorationTypes.set(type, decorationType);
      this.disposables.push(decorationType);
    }
    return this.decorationTypes.get(type)!;
  }

  private getColorForType(type: string): string {
    // Use the dynamically assigned color for this token type
    return this.tokenTypeColors.get(type) || '#dcdcdc';
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

let highlighter: DynamicSyntaxHighlighter;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('vscode-code-strings extension is now active!');
  
  highlighter = new DynamicSyntaxHighlighter(context);
  highlighter.activate();
  
  context.subscriptions.push(highlighter);
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (highlighter) {
    highlighter.dispose();
  }
}
