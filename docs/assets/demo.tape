# vhs recipe → docs/assets/demo.gif  (https://github.com/charmbracelet/vhs)
#   vhs docs/assets/demo.tape
# Reproducible on purpose: the demo uses stub agents (no LLM/network), so the recording
# is deterministic modulo temp paths. Re-record whenever the demo's stages change.
Output docs/assets/demo.gif
Set FontSize 15
Set Width 1100
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Type "npx chalk-protocol demo"
Enter
Sleep 30s
