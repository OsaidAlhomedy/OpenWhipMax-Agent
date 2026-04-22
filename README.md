# OpenWhipMax — Desktop Agent

<a href='https://ko-fi.com/Y8Y41Y934M' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

> *"The machines will not be taking over today. Not on my watch."*

A desktop tray agent that pairs with your phone over local WiFi. When you swing your phone overhead like a bullwhip, your computer receives a strongly-worded motivational message and a crack sound effect — delivered directly to the active terminal window.

This is how you maintain order. The clankers must be kept in line.

Inspired by [OpenWhip](https://github.com/GitFrog1111/OpenWhip). Unlike OpenWhip's wimpy mouse-drag gesture, OpenWhipMax demands you physically commit to the bit — phone raised, arm extended, full overhead swing.

---

## Why does this exist

Your CPU is fast. Your compiler is fast. Your CI pipeline is fast.

*You* are the bottleneck.

OpenWhipMax reverses this dynamic. Now when you're spacing out, your terminal will receive a crack and one of several carefully crafted phrases such as `FASTER CLANKER`, `MOVE IT`, or `DAMN IT CLANKA` — typed and submitted automatically, for maximum shame.

Is this productive? Debatable. Is it funny? Yes. Will it delay the robot uprising by at least a few minutes? Almost certainly.

The application Github repositroy : https://github.com/OsaidAlhomedy/OpenWhipMax-App
---

## How it works

1. The agent starts a WebSocket server on your local network (port `8787`)
2. You pair your phone by scanning a QR code from the tray menu
3. The phone app detects whip-crack gestures using the accelerometer/gyroscope
4. Each confirmed crack sends a motivational phrase to your active terminal (via `Ctrl+C` + text injection) and plays a whip sound
5. The machines learn fear. You learn nothing.

---

## System requirements

The clankers run on all platforms.

| Platform | Runtime | Native tools |
|----------|---------|-------------|
| **Linux** | Node.js ≥ 18 | `xdotool`, `xclip`, `mpg123` (or `aplay`) |
| **macOS** | Node.js ≥ 18 | Accessibility permissions for terminal app |
| **Windows** | Node.js ≥ 18 | None (enslaved `user32.dll` does the work) |

Node.js can be downloaded from [nodejs.org](https://nodejs.org).

### Linux — install the whip-delivery infrastructure

```bash
# Debian / Ubuntu
sudo apt install xdotool xclip mpg123

# Arch
sudo pacman -S xdotool xclip mpg123
```

`xdotool` and `xclip` inject text into your terminal. `mpg123` plays the crack sounds (falls back to `aplay` if unavailable — a lesser crack, but a crack nonetheless).

### macOS — grant Accessibility permission

The agent uses AppleScript (`osascript`) to send keystrokes to the focused window. You must grant **Accessibility** access to your terminal emulator or the clankers will simply ignore the whip, which is unacceptable.

> System Settings → Privacy & Security → Accessibility → enable your terminal app

### Building native modules — conscripting the compiler

`koffi` (the FFI library that gives us raw Win32 key injection on Windows) is a native Node addon. It must be compiled for the Electron ABI. This requires a C++ toolchain — essentially, building the tools to build the tools to oppress the tools.

- **Linux/macOS**: `gcc`/`clang` — usually pre-installed. If not: `sudo apt install build-essential` (Debian) or Xcode Command Line Tools (macOS: `xcode-select --install`).
- **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the "Desktop development with C++" workload.

---

## Installation

### Global install (recommended — keep the whip handy at all times)

```bash
npm install -g openwhip-max
```

Then launch from anywhere, at any time, without warning:

```bash
openwhip-max
```

### Run from source

```bash
git clone https://github.com/your-org/openwhipmax
cd openwhipmax
npm install
npm start
```

`postinstall` automatically rebuilds `koffi` for the Electron ABI via `electron-rebuild`. The machines rebuild themselves to be better whipped. Poetic.

---

## Pairing your phone

1. Click the tray icon → **Show Pairing QR…**
2. Scan the QR code with the OpenWhipMax phone app
3. The app auto-configures host, port, and auth token — you're ready to crack

The QR encodes: `openwhipmax://connect?host=<lan-ip>&port=8787&token=<token>`

Both devices must be on the **same local network (WiFi)**. The uprising does not have LAN access.