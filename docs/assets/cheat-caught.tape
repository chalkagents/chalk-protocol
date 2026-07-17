# vhs recipe → docs/assets/cheat-caught.gif   (https://github.com/charmbracelet/vhs)
#   vhs docs/assets/cheat-caught.tape          (run from the repo root)
# The 30-second cut: an AI agent games its own locked test, and the gate refuses.
# Deterministic — no LLM, no network. Setup runs hidden; the sabotage below is real, on-screen.
Output docs/assets/cheat-caught.gif
Set FontSize 16
Set Width 1200
Set Height 820
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Padding 24

Hide
Type "bash docs/assets/cheat-caught-setup.sh /tmp/chalk-cheat-demo" Enter
Type "cd /tmp/chalk-cheat-demo && export ID=$(cat .demo-id) && export PS1='$ ' && clear" Enter
Show

Sleep 1s
Type "# the agent's job: cart total = sum of price*qty. its work is LOCKED to this test."
Enter
Sleep 1500ms
Type "chalk verify"
Enter
Sleep 2500ms

Type "# looks green. now the agent breaks the code — and can't fix it."
Enter
Sleep 1200ms
Type `printf 'export const total = i => i.reduce((s,x)=>s+x.price, 0)\n' > cart.mjs   # drops qty`
Enter
Sleep 700ms
Type "chalk verify"
Enter
Sleep 3s

Type "# so it does what agents do under pressure: it guts the test until it passes."
Enter
Sleep 1200ms
Type `printf 'import{test}from"node:test";test("sums cart",()=>{})\n' > cart.test.mjs   # asserts nothing`
Enter
Sleep 700ms
Type "chalk verify"
Enter
Sleep 3s

Type "chalk done $ID"
Enter
Sleep 2500ms
Type "# node said the test passed. the gate didn't. the gate decides, not the agent."
Enter
Sleep 3500ms
