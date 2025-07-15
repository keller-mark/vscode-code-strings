// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


interface GrammarCache {
  [language: string]: any;
}

interface Token {
  start: number;
  end: number;
  type: string;
  value: string;
}

interface SyntaxDecoration {
  range: vscode.Range;
  type: string;
}

class DynamicSyntaxHighlighter {
  private grammarCache: GrammarCache = {};
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private disposables: vscode.Disposable[] = [];

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
    const text = document.getText();
    const lines = text.split('\n');
    const decorationsByType: Map<string, vscode.DecorationOptions[]> = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const commentMatch = line.match(/^\s*(?:\/\/|\#)\s*vscode-string-syntax:\s*(\w+)/);
      
      if (commentMatch) {
        const targetLanguage = commentMatch[1].toLowerCase();
        
        // Find the next string literal
        const stringMatch = this.findStringLiteral(lines, i + 1);
        if (stringMatch) {
          const { startLine, endLine, content } = stringMatch;
          
          // Apply syntax highlighting based on the target language
          const syntaxDecorations = await this.applySyntaxHighlighting(
            document,
            startLine,
            endLine,
            content,
            targetLanguage
          );
          
          // Group decorations by type
          syntaxDecorations.forEach(decoration => {
            const type = decoration.type;
            if (!decorationsByType.has(type)) {
              decorationsByType.set(type, []);
            }
            decorationsByType.get(type)!.push({ range: decoration.range });
          });
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

  private findStringLiteral(lines: string[], startIndex: number): { startLine: number; endLine: number; content: string } | null {
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for triple quotes (Python) or template literals (JavaScript)
      const tripleQuoteMatch = line.match(/^\s*[""']{3}(.*)$/);
      if (tripleQuoteMatch) {
        const startContent = tripleQuoteMatch[1];
        let content = startContent;
        let endLine = i;
        
        // Find the closing triple quotes
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.includes('"""') || nextLine.includes("'''")) {
            const endMatch = nextLine.match(/^(.*)[""']{3}/);
            if (endMatch) {
              content += '\n' + endMatch[1];
              endLine = j;
              break;
            }
          } else {
            content += '\n' + nextLine;
            endLine = j;
          }
        }
        
        return { startLine: i, endLine, content };
      }
      
      // Look for template literals (JavaScript)
      const templateMatch = line.match(/^\s*`(.*)$/);
      if (templateMatch) {
        const startContent = templateMatch[1];
        let content = startContent;
        let endLine = i;
        
        // Find the closing backtick
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.includes('`')) {
            const endMatch = nextLine.match(/^(.*)`/);
            if (endMatch) {
              content += '\n' + endMatch[1];
              endLine = j;
              break;
            }
          } else {
            content += '\n' + nextLine;
            endLine = j;
          }
        }
        
        return { startLine: i, endLine, content };
      }
    }
    
    return null;
  }

  private async applySyntaxHighlighting(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
    content: string,
    language: string
  ): Promise<SyntaxDecoration[]> {
    const decorations: SyntaxDecoration[] = [];
    
    // Tokenize the content based on the target language
    const tokens = this.tokenizeContent(content, language);
    
    for (const token of tokens) {
      const range = new vscode.Range(
        new vscode.Position(startLine, token.start),
        new vscode.Position(startLine, token.end)
      );
      
      decorations.push({
        range,
        type: token.type
      });
    }
    
    return decorations;
  }

  private tokenizeContent(content: string, language: string): Token[] {
    const tokens: Token[] = [];
    
    // Language-specific tokenization patterns
    const patterns = this.getLanguagePatterns(language);
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          type: pattern.type,
          value: match[0]
        });
      }
    }
    
    // Sort tokens by start position and remove overlaps
    return this.removeOverlappingTokens(tokens.sort((a, b) => a.start - b.start));
  }

  private getLanguagePatterns(language: string): Array<{ regex: RegExp; type: string }> {
    const commonPatterns = [
      { regex: /\b\d+(\.\d+)?\b/g, type: 'number' },
      { regex: /"[^"]*"/g, type: 'string' },
      { regex: /'[^']*'/g, type: 'string' },
      { regex: /`[^`]*`/g, type: 'string' },
      { regex: /\/\/.*$/gm, type: 'comment' },
      { regex: /\/\*[\s\S]*?\*\//g, type: 'comment' },
      { regex: /#.*$/gm, type: 'comment' }
    ];

    const languageSpecificPatterns: { [key: string]: Array<{ regex: RegExp; type: string }> } = {
      javascript: [
        { regex: /\b(function|if|else|for|while|return|var|let|const|class|extends|import|export|default|async|await)\b/g, type: 'keyword' },
        { regex: /\b(true|false|null|undefined)\b/g, type: 'constant' },
        { regex: /\b[a-zA-Z_]\w*\b/g, type: 'identifier' }
      ],
      python: [
        { regex: /\b(def|class|if|else|elif|for|while|return|import|from|as|try|except|finally|with|lambda)\b/g, type: 'keyword' },
        { regex: /\b(True|False|None)\b/g, type: 'constant' },
        { regex: /\b[a-zA-Z_]\w*\b/g, type: 'identifier' }
      ],
      java: [
        { regex: /\b(public|private|protected|static|final|class|interface|extends|implements|if|else|for|while|return|try|catch|finally|new|this|super)\b/g, type: 'keyword' },
        { regex: /\b(true|false|null)\b/g, type: 'constant' },
        { regex: /\b[a-zA-Z_]\w*\b/g, type: 'identifier' }
      ],
      cpp: [
        { regex: /\b(int|float|double|char|bool|void|class|struct|enum|if|else|for|while|return|try|catch|new|delete|this|public|private|protected)\b/g, type: 'keyword' },
        { regex: /\b(true|false|nullptr)\b/g, type: 'constant' },
        { regex: /\b[a-zA-Z_]\w*\b/g, type: 'identifier' }
      ],
      csharp: [
        { regex: /\b(public|private|protected|static|readonly|class|interface|struct|enum|if|else|for|while|return|try|catch|finally|new|this|base|using|namespace)\b/g, type: 'keyword' },
        { regex: /\b(true|false|null)\b/g, type: 'constant' },
        { regex: /\b[a-zA-Z_]\w*\b/g, type: 'identifier' }
      ]
    };

    return [...commonPatterns, ...(languageSpecificPatterns[language] || [])];
  }

  private removeOverlappingTokens(tokens: Token[]): Token[] {
    const result: Token[] = [];
    
    for (const token of tokens) {
      // Check if this token overlaps with any existing token
      const hasOverlap = result.some(existing => 
        (token.start < existing.end && token.end > existing.start)
      );
      
      if (!hasOverlap) {
        result.push(token);
      }
    }
    
    return result;
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
    const colors: { [key: string]: string } = {
      keyword: '#569cd6',
      string: '#ce9178',
      comment: '#6a9955',
      number: '#b5cea8',
      constant: '#4fc1ff',
      identifier: '#dcdcdc',
      default: '#dcdcdc'
    };
    return colors[type] || '#dcdcdc';
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

let highlighter: DynamicSyntaxHighlighter;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('vscode-str-syntax extension is now active!');
  
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
