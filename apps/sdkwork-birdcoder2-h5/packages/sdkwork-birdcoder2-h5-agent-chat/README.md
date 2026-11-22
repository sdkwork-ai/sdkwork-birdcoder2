# @sdkwork/birdcoder2-h5-agent-chat

Agent conversation capability: list the conversations on one host, read the live transcript, submit a turn, and follow the event log from a resume watermark.

- Surface: `h5`
- Layer role: `feature` (capability `agent-conversation`)
- Standard: `MODULE_SPEC.md`, `APP_H5_ARCHITECTURE_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `.` | Public contract: the conversation provider/hook, its failure projection, the two screens, the route contributions, and the localized message resolution. |
| `./state/conversationState` | `ConversationProvider` / `useConversation`; owns the streaming turn state. |
| `./routes` | `app.agent.chat.*` route contributions the shell registers. |
| `./screens/ChatPage`, `./screens/SessionListPage` | The transcript and per-host session list. |
| `./messages/agentChatMessages` | The capability's localized copy. |

## Model Experience

The capability is a relay client: it opens a conversation on one host, appends user turns, and
follows the ordered agent event log by `sequence` watermark, so a reconnect resumes instead of
replaying the transcript. It receives `BirdCoder2Ports` as a prop and never constructs a
transport; only the delta/complete/failure projections of an event are interpreted here.

## Known Limitations and Deferred Work

- The event log is read by polling the watermark; a push transport would be a new port adapter in
  `@sdkwork/birdcoder2-h5-core`, touching no screen.
- Tool-event payloads are passed through; only assistant text is rendered in the transcript.
