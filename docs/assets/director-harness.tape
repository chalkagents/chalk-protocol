# vhs recipe → docs/assets/director-harness.gif   (https://github.com/charmbracelet/vhs)
#   vhs docs/assets/director-harness.tape          (run from the repo root)
# The director's harness in 8 beats: align → raise → digest → pending → rebuild → compound
# (+ the chalk harness finale). Deterministic — canned reviewer, no LLM, no network.
# The demo script pauses on Enter between beats; each Sleep below is that beat's dwell time.
Output docs/assets/director-harness.gif
Output docs/assets/director-harness.mp4
Set FontSize 15
Set Width 1240
Set Height 800
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Padding 22

Type "bash docs/demo/director-harness-demo.sh"
Enter
# beat 1 · director mode — task scoped
Sleep 5s
Enter
# beat 2 · align: the build refuses, you accept "done"
Sleep 9s
Enter
# beat 3 · raise: the agent asks mid-work, the build pauses, you answer
Sleep 11s
Enter
# beat 4 · the reviewer's decision digest (risk-ranked)
Sleep 10s
Enter
# beat 5 · the director inbox — redirect the risky call
Sleep 11s
Enter
# beat 6 · the correction travels back — rebuild + resolve
Sleep 9s
Enter
# beat 7 · judgment compounds into the NEXT task
Sleep 9s
Enter
# beat 8 · chalk harness — the kit you composed + closing line
Sleep 10s
