# Integration status

Date: 2026-11-24 (Africa/Nairobi)

## Implemented

- Four deterministic, versioned games are available: Mtoni Water Resilience, Soko Market, Mtoni Fever Response, and Chama Trust Circle. Availability is teacher/class assigned; no game is restricted to a particular grade.
- Learners can play through the web app, SMS, or USSD. A teacher issues one-time phone-link codes from `/teacher`; SMS, USSD, and web continue the same saved learner run.
- SMS and USSD include English and Kiswahili menus, saved decisions, reflection prompts, resume commands, duplicate-callback protection, and bounded response lengths.
- Optional resume nudges require explicit `OPT IN`; `STOP`/`ACHA` removes stored phone ciphertext while leaving gameplay available.
- Docker Compose starts the API, frontend, and mobile-nudge worker with `docker compose up --build`.

## Verification completed

| Check | Result |
|---|---|
| Backend test suite | 100 passed, 4 skipped. Skipped cases need direct database access from the host runner. |
| Backend static checks | Ruff lint passed; all 80 Python files formatted; Python compile check passed. |
| Frontend checks | 1 test passed; ESLint, Prettier, TypeScript typecheck, and production build passed. |
| Frontend dependency audit | 0 reported vulnerabilities after updating compatible pinned dependencies. |
| Docker Compose rebuild | Backend and frontend rebuilt. Backend and frontend health checks are healthy; nudge worker is running. |
| Live API check | Health returned `ok`; `/ussd`, `/webhook/incoming`, `/api/mobile/classes`, and `/api/mobile/join-codes` are registered. |
| Mobile privacy smoke | Passed code redemption, same-phone retry, encrypted opt-in, `STOP` cleanup, and temporary-row cleanup using the seeded synthetic learner. It does not send a text. |
| Supabase | Migrations `0001`–`0009` are applied. Four missions are teacher-assigned; the three added games are assigned to the synthetic demo class. The mobile smoke removed its temporary rows. |
| SMS and USSD callbacks | Africa's Talking SMS/USSD callbacks reached the app. ngrok history includes older 404s from before the current routes were deployed; current routes return 200. |
| SMS delivery report | Fixed the strict status schema to accept Africa's Talking's `retryCount` field. A provider retry now receives HTTP 200. |
| Outbound SMS | Test request was accepted (`sent`), but the provider's final sandbox report was `Failed` / `DeliveryFailure`. |

## Africa's Talking testing

This project is configured for the Africa's Talking sandbox. Sandbox SMS goes to the web simulator, not a physical handset. A sandbox `DeliveryFailure` can mean the simulator is not logged in or is unreachable; see Africa's Talking's [sandbox instructions](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox) and [delivery failure guidance](https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail). A `sent` response means provider acceptance, not handset delivery; only a final `Success`/`Delivered` status confirms delivery ([status definitions](https://help.africastalking.com/en/articles/16150386-messaging-error-codes)).

### Test in the sandbox simulator

1. Start services from the repository root with `docker compose up --build`; keep the computer and ngrok tunnel running.
2. Set the Africa's Talking USSD callback to `<PUBLIC_BASE_URL>/ussd?token=<WEBHOOK_TOKEN>` and incoming SMS callback to `<PUBLIC_BASE_URL>/webhook/incoming?token=<WEBHOOK_TOKEN>`. Set the optional delivery-report callback to `<PUBLIC_BASE_URL>/api/webhooks/africastalking/sms-status?token=<WEBHOOK_TOKEN>`.
3. Open the Africa's Talking sandbox simulator, log in, and register the test number there. If `AT_ALLOWED_PHONES` is nonempty, include that number in the sandbox allowlist.
4. Sign into `/teacher`, choose a class and learner, and issue a one-time link code. Send `JOIN <code>` in the simulator's SMS inbox or enter it in the USSD simulator.
5. For SMS, send `GAMES`, then `PLAY 1`. Send `HELP` for commands, `CONTINUE` to resume, and numbered choices to continue a turn. On USSD, select a game and follow the numbered prompts. SMS and USSD share the learner's saved state.
6. Confirm the simulator displays the outbound reply and the callback returns 200. Sandbox SMS is not delivered to physical phones.

### Test on an actual handset

Use Africa's Talking Live credentials in the root `.env`: set `AT_USERNAME` to the Live app username and `AT_API_KEY` to that app's Live key. Sandbox and Live keys are separate. The Live account also needs an approved sender ID or shortcode, available balance, Live callback URLs, and a real test number in `AT_ALLOWED_PHONES`. Live messages can incur charges. Test by playing through SMS from the handset; the sandbox-only test-message helper must not be used with Live credentials.

## Remaining launch requirements

- Verify final SMS delivery to a real handset with Live credentials and an approved sender ID/shortcode.
- Kiswahili translations and learning objectives need review by a fluent educator and classroom teacher.
- The app does not collect guardian details or record guardian authorization. Before using real minors, the organization must determine lawful basis, school/guardian authorization, retention, deletion, and any data-transfer requirements with its data-protection lead; see [Kenya ODPC data-protection resources](https://www.odpc.go.ke/data-protection-laws-kenya/).
- Supabase's existing Auth leaked-password-protection recommendation remains a dashboard setting. Credentials shared during setup should be rotated before production use.
