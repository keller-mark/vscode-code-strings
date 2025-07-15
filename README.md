# vscode-code-strings

A VSCode extension which enables syntax highlighting for language A (child language) within strings written in language B (parent language).

When this extension is enabled, comments in language B immediately before the string definition can enable this behavior.
For example, to enable highlighting of a string containing JS code within a Python script, the developer would write:

```python
# lang: js
my_js_str = """
function add(a, b) {
    return a + b;
}
"""
```

The extension will highlight the contents of the string using the specified language's syntax.

The main motivations for this extension are:
- JS-in-Python strings for [anywidget](https://anywidget.dev/)
- GLSL-in-JS strings for writing WebGL shaders (without using a bundle step)

-----

### Usage

1. **Install the extension** from the VSCode Marketplace or by loading it as an unpacked extension during development.
2. **Open a file** in your parent language (e.g., Python).
3. **Add a `lang: <lang>`comment** immediately before a string to specify the child language for syntax highlighting.  
4. The string contents will be highlighted according to the specified language.

-----

### Development

To test or develop the extension locally:

1. **Clone this repository**:
   ```sh
   git clone <repo-url>
   cd vscode-code-strings
   ```

2. **Install dependencies**:
   ```sh
   npm install
   ```

3. **Open the project in VSCode**:
   ```sh
   code .
   ```

4. **Start the extension host**:
   - Press `F5` to launch a new Extension Development Host window with the extension loaded.

5. **Test the extension** by opening a supported file and using the `# lang: <child-language>` comment before a string.

6. **Make changes** to the code as needed. The extension host will reload on save.

7. **Package the extension** (optional, for distribution):
   ```sh
   npm run vsce-package
   ```

8. Install

   ```sh
   code --install-extension ./vscode-code-strings-0.0.1.vsix
   ```

   To debug: Help -> Toggle Developer Tools -> Console (to view console.log statements and errors from the extension).

For more information, see the [VSCode Extension API documentation](https://code.visualstudio.com/api).

<!-- Below content left over from template -->
<!--
## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
-->
