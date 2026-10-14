// Pixel Bot.exe — opens the Pixel Bot app (https://pixelbotstudio.net) in its own window.
// No install needed: put it anywhere (like the desktop) and double-click it.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

const site = "https://pixelbotstudio.net/start"

func exists(p string) bool {
	if p == "" {
		return false
	}
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func browsers() []string {
	pf := os.Getenv("ProgramFiles")
	pf86 := os.Getenv("ProgramFiles(x86)")
	local := os.Getenv("LOCALAPPDATA")
	return []string{
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(local, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `BraveSoftware\Brave-Browser\Application\brave.exe`),
		filepath.Join(local, `BraveSoftware\Brave-Browser\Application\brave.exe`),
	}
}

// start launches a program normally (visible), so the app window always shows up.
func start(name string, args ...string) error {
	return exec.Command(name, args...).Start()
}

// startHidden is only for the helper that hands the link to the default browser.
func startHidden(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
}

func main() {
	for _, b := range browsers() {
		if exists(b) {
			if start(b, "--app="+site, "--new-window", "--window-size=1150,820") == nil {
				return
			}
		}
	}
	// No Chrome/Edge found: open it in whatever browser is the default.
	_ = startHidden("rundll32", "url.dll,FileProtocolHandler", site)
}
