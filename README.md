![GnomeLama4](https://github.com/user-attachments/assets/64b8c9e7-cd14-4adf-92d4-e92d7aac13d9)

# GnomeLama (Linux Copilot)

GnomeLama is an integration between Ollama (the open source local ai project) and gnome. Trying to bring windows copilot to linux with more functionality.

## Features
- Model selection (changing models)
- Clearing history
- Chat messaging
- Chat panel
- Running bash commands
- Settings to change things
- ChatGpt Api
- Files

## Features In Progress

- File editing
- Tutorial/showcase video

## Installation

> [!NOTE]
> This extension is only for Gnome (desktop environment) on Linux.

1. Clone this repository to your GNOME extensions directory:
   ```bash
   git clone https://github.com/TheoThePerson/GnomeLama.git ~/.local/share/gnome-shell/extensions/linux-copilot@TheoThePerson
   ```
2. Enable the extension:
   ```bash
   gnome-extensions enable GnomeLama
   ```
3. (Optional) Restart GNOME Shell (Alt + F2, then type `r` and press Enter).

## Screenshots

![image](https://github.com/user-attachments/assets/311f6fe3-bd67-41a3-841b-c43ab9110d39)

## Document Format Support

The extension now supports viewing various document formats beyond simple text files:

- Text files (.txt, .md, .json, .xml, .html, etc.)
- Word documents (.doc, .docx)
- OpenDocument Text (.odt)
- PDF documents (.pdf)
- Rich Text Format (.rtf)

### File Upload

To enable using these documents with the extention you need to install:

- For .docx files: `docx2txt`
- For .odt files: `odt2txt`
- For .doc files: `catdoc`
- For .rtf files: `unrtf`
- For .pdf files: `pdftotext` (usually part of the `poppler-utils` package)

On Debian/Ubuntu-based systems, you can install these with:

```bash
sudo apt install docx2txt odt2txt catdoc unrtf poppler-utils
```

On Fedora/RHEL-based systems:

```bash
sudo dnf install docx2txt odt2txt catdoc unrtf poppler-utils
```

On Arch Linux:

```bash
sudo pacman -S catdoc poppler
yay -S docx2txt odt2txt unrtf
```

### PDF Handling

For PDF files, the extension uses `pdftotext` to extract text content. Please note:

- PDF files that are primarily image-based (scanned documents) may not show any text content
- Password-protected PDFs cannot be displayed
- Some PDFs with complex layouts may not convert perfectly
- Converting large PDFs may take a moment

## Contributing

1. Fork this repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Commit your changes (`git commit -am 'Add new feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Create a new Pull Request.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TheoThePerson/GnomeLama&type=Date)](https://star-history.com/#TheoThePerson/GnomeLama&Date)


## License

This project is licensed under the MIT License.
