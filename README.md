# Inquisitive

A reading app and personal library for the Mac. It keeps your books, PDFs and saved
articles in one place, opens them in a quiet reader, and lets you ask a model about what
you are reading, using a subscription or key you already have.

## What it does

- **A library of your own.** Add EPUBs and PDFs, or save an article from its web address.
  Everything is kept as plain files in a folder you can move (`~/Documents/Inquisitive`
  unless you choose another in Settings).
- **A reader.** Books and articles read as pages or as one scrolling column; PDFs scroll.
  Contents, find, footnotes that pop up beside the text, links inside PDFs, and six
  themes from white to black.
- **Highlights and notes.** Highlight in several colours and write notes in the margin.
  Home brings one of your highlights back each day.
- **Collections.** Group items under a name and a colour, by hand or by letting the model
  sort what is loose.
- **Home and Finished.** Home shows what to carry on with and how long you have read this
  week. Finished is a timeline of what you completed, month by month.
- **Chat beside the page.** Ask about the book that is open. The model reads the book
  itself: it can look at the contents, read a chapter, search, see where you are, and go
  through your highlights. Chats are kept per book.

## The model is yours

Inquisitive has no account and no server of its own. In Settings you connect one or more
of:

- **ChatGPT**, by signing in.
- **Claude**, through Claude Code, if it is installed and signed in on this Mac.
- **An API key**, for Anthropic, OpenAI or any address that speaks OpenAI's API.
- **A local model**, such as one served by Ollama or LM Studio.

What you ask goes from your Mac to the model you chose, and nowhere else.

## Install

Download the `.dmg` from the [latest release](../../releases/latest), open it, and drag
Inquisitive to Applications. It is built for Apple silicon, signed with a Developer ID and
notarized by Apple.

## Run from source

Needs a recent Node and npm.

```sh
npm install
npm start
```

## Test

```sh
npm test
```

The tests start the real app off-screen on a small test library and drive it with real
clicks and typing. No account, key or model is touched: stand-ins answer in their place.
They need the `sqlite3` program (and `zstd`, on Node before 23.8), take about seven
minutes, and run one at a time.

## Package

```sh
npm run package
```

Builds `dist/Inquisitive-darwin-arm64/Inquisitive.app` and signs it with the Developer ID
Application certificate in your keychain, if there is one.

## Release

```sh
npm run release
```

Builds the app signed with the hardened runtime, has Apple notarize it, and puts it in
`dist/Inquisitive-<version>-arm64.dmg`, which is signed and notarized too. It needs a
Developer ID Application certificate in your keychain, and your notarization credentials
stored once under the name `inquisitive` (`release.sh` says how).

## Where things are

| Path | What it is |
| --- | --- |
| `main.js`, `preload.js` | The app's window and what the page may ask of it |
| `library.js` | The library folder: files, the record of them, moving it |
| `chats.js` | Chats kept per book, and the tools a model reads the book with |
| `assistant.js` | Signing in with ChatGPT, and asking it |
| `connections.js` | Claude through Claude Code, API keys and local models |
| `pi.js` | Asking a model through the pi libraries, tool use included |
| `renderer/` | The window itself: library, reader, chat, settings |
| `test/` | The off-screen tests and what they are held against |
