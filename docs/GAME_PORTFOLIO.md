# MtaaLab game portfolio and mobile access

## Scope and audience

MtaaLab offers four short, replayable simulations. They are available to learners in any grade when a teacher assigns them to the learner's active class. The software does not filter or recommend games by grade. Teachers choose the context and can use the web app, SMS, or USSD; the same learner identity and per-game saved run are shared across channels.

The games are educational prototypes, not validated measures of learning. Objectives, Kiswahili wording, accessibility, scenario assumptions, and classroom suitability need review by Kenyan teachers and learners before broad deployment. Curriculum connections below are proposed strands, not formal KICD approval. The KICD curriculum-design library is a useful review reference: [Junior School curriculum designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/junior-school-designs/).

## Game designs

All values below are fictional game units. The engine owns all state changes. NVIDIA NIM cannot set budgets, costs, quantities, or outcomes. Scenario JSON and `rules_version` are immutable simulation inputs; a change to rules requires a reviewed new version.

| Game | Six-turn decision loop | Main learning question | Fictional starting state |
|---|---|---|---|
| Mtoni Water Resilience | Choose community water repairs, conservation, allocation, storage, or irrigation actions while scripted inflows, demand, and delayed effects change the system. | How do infrastructure, finite water, and sector priorities interact over time? | Reservoir 60/100; budget 100; fictional sector demands and service indices. |
| Mama Mboga Market | Each market day choose one of three order-size and selling-price plans. Demand, supplier shortfall, leftovers, and spoilage are deterministic for the saved event seed. | How do price, demand, cash, stock, and spoilage affect one another? | Cash 100; stock 10; reference price 8; unit cost 4. Plans order 5 or 10 units at prices 6, 8, or 10. |
| Mtoni Fever Response | Allocate a planning budget across water access, handwashing access, and clinic readiness. Water and handwashing changes take one turn; scripted disruptions are shown separately. | Why can infrastructure have delayed effects, and how are access measures different? | Budget 100; fictional access indices: water 60, handwashing 20, readiness 20. No disease incidence or health outcome is simulated. |
| Chama Trust Circle | Save 10 tokens into a protected reserve or approve one of two fictional requests (30 or 40). A fictional 10% fee schedules later repayment; each meeting has a published payment-capacity event. | How does a reserve change available funds, delayed repayments, and group choices? | Pool 100 tokens, including a protected reserve of 20; no real money, credit product, or payment occurs. |

These amounts are game-balancing parameters, not Kenyan market prices, health findings, loan terms, or community statistics. Background references can inform teacher review, but no real-world numeric values are copied into the engine: [KNBS MSME survey](https://www.knbs.or.ke/2016-micro-small-and-medium-enterprises-msme-survey-basic-report/), [WHO WASH guidance](https://www.who.int/publications/i/item/9789240095366), and [SASRA FAQs](https://www.sasra.go.ke/frequently-asked-questions/). The Chama scenario is not a savings product or financial advice. Review its language, group governance assumptions, and cultural fit before classroom use.

### Productive failure, reflection, and hints

After each committed turn in portfolio games, SMS and USSD offer three short reflection choices. Two choices identify a common reasoning path; the third requests a hint. Choosing a hint records only its bounded code and a scenario-approved misconception tag, then reveals a progressive clue. The web app presents the same saved reflection and hint ladder. Reflection records attach to the simulation session and turn, not a phone number. They are prompts for discussion, not grades or learner diagnoses.

The hint ladder moves from noticing saved evidence, to comparing variables, to interpreting a specific event. It never gives a hidden numeric outcome or changes game state. Mtoni Water Resilience retains its existing action feedback and does not require a reflection step on every turn.

## SMS and USSD flow

### First-time phone linking

1. A teacher issues a one-time learner code for an existing active class member. The code expires after seven days and is displayed once.
2. The learner texts `JOIN CODE` (or `JIUNGE CODE`) to the Africa's Talking SMS short code, or dials the USSD code, chooses English/Kiswahili, and enters the learner code.
3. The code is single-use and tied to the learner's existing profile and class. A phone can be linked to only that learner. A provider retry from that same phone is safe and returns the existing link.
4. Linking enables play; it does not subscribe the learner to reminder messages. SMS nudges require a separate `OPT IN` (`ANZA UJUMBE`) and can be stopped with `STOP` (`ACHA`).

### SMS commands

| Command | Behavior |
|---|---|
| `HELP` | Show the short bilingual command guide. |
| `JOIN CODE` / `JIUNGE CODE` | Redeem the teacher-issued code. |
| `GAMES` / `MICHEZO` | List games currently assigned to the learner's class. |
| `PLAY 1` / `CHEZA 1` | Start or resume the selected game's active run. |
| `CONTINUE` / `ENDELEA` | Resume the latest active run. After a turn, answer the required `WHY 1`, `WHY 2`, or `WHY 3` prompt first. |
| `WHY 1`, `WHY 2`, `WHY 3` | Record one bounded reflection choice for the last confirmed turn. |
| `HINT` / `DOKEZO` | Show the next hint after requesting help. |
| `STATUS` / `MAENDELEO` | Show progress for the active run. |
| `LANG EN` / `LANG SW` | Set the preferred language. |
| `OPT IN` / `ANZA UJUMBE` | Encrypt and retain the phone address for optional resume nudges. |
| `STOP` / `ACHA` | Clear the encrypted phone address and stop future nudges; game access remains. |

Messages are bounded to a single 160-character SMS reply. Provider delivery and handset display still depend on Africa's Talking and the mobile network. When `AT_ALLOWED_PHONES` is nonempty, the callback accepts only numbers on that sandbox allowlist; clear or update it deliberately when onboarding a different test phone.

### USSD screens

The Africa's Talking callback receives cumulative input split on `*`. The application returns one plain-text screen of at most 160 characters, beginning with `CON ` or `END `.

| Screen | English | Kiswahili |
|---|---|---|
| Welcome | `1 English / 2 Kiswahili` | Language is chosen on the welcome screen. |
| Link | Enter one-time learner code | Weka msimbo wa mwanafunzi |
| Main menu | `1 Continue, 2 Choose game, 3 Progress, 4 Help, 0 Exit` | `1 Endelea, 2 Chagua mchezo, 3 Maendeleo, 4 Msaada, 0 Toka` |
| Game list | Numbered assigned games | Namba za michezo iliyowekwa |
| Turn | Current turn, fictional game values, and numbered actions | Zamu ya sasa, thamani za mchezo, na maamuzi ya namba |
| Reflection | `1` or `2` for a reason; `3` for a hint | Chaguo fupi la sababu au dokezo |
| Hint | One bounded clue, continue/more choices | Dokezo moja, endelea/dokezo zaidi |

The production code currently uses localized short labels, but all Kiswahili game language needs review by a fluent educator. USSD sessions expire after 180 seconds; the simulation itself remains saved and can be resumed in a new dial. Repeated provider callbacks replay the saved response and do not apply a second decision.

## Platform, privacy, and service limits

- The web app uses the authenticated learner profile. SMS/USSD only resolves a profile after redemption of a teacher-issued code. Phone identities are HMAC digests using `PHONE_HMAC_SECRET`; raw phone values are not saved during normal gameplay.
- The app stores a phone ciphertext only after explicit reminder opt-in. `PHONE_ENCRYPTION_KEY` must remain stable and private for as long as consented reminders are active. `STOP` clears the ciphertext. The nudge worker sends only for opted-in records, between 09:00 and 20:00 East Africa Time, at most once per new active turn, and at most four send attempts per learner/month.
- `MOBILE_JOIN_CODE_PEPPER` is needed to hash one-time access codes. All three mobile secrets belong in the root `.env`; never put them in `VITE_` settings or commit them.
- The worker starts with `docker compose up --build`; it skips sends when Africa's Talking credentials are absent. It uses the same sandbox/provider credentials as backend SMS replies.
- Callbacks and the worker are deterministic and do not call NVIDIA. Numeric results come only from the versioned rules engine. NIM can provide bounded, qualitative feedback only in the existing Mtoni web debrief flow; other games currently return a static evidence-based debrief and mark AI feedback unavailable.
- SMS callback input, provider form fields, and USSD screens are bounded. Decisions are idempotent, saved per learner/game, and shared across web, SMS, and USSD. Text commands and phone numbers are not written to logs.
- The current implementation does not collect guardian contact details or record parental/guardian authorization. Phone linking and SMS `OPT IN` are technical controls, not proof of legal authority to process a child's data. Before deployment with minors, confirm the lawful basis, guardian/school consent process, retention and deletion periods, and any transfer requirements with the organization's data-protection lead. Mark this review as **needs verification** against the [Kenya Data Protection Act resources](https://www.odpc.go.ke/data-protection-laws-kenya/); the Kenya law's provisions on children's data and best interests must be assessed for the deployment.
- There is no grade restriction in mission discovery or the mobile link. School/class assignment and the teacher's classroom judgment determine availability.

## Acceptance checks

Before launch, verify all of the following in the Africa's Talking sandbox simulator and then with a Live test handset:

1. Teacher code creation, successful redemption, same-phone retry, expired/used code rejection, and wrong-class rejection.
2. A learner can join, list assigned games, start on SMS, continue the same run through USSD or web, and see the same confirmed turn.
3. Repeated SMS IDs and USSD session/text pairs do not apply a turn twice; an invalid action does not change state.
4. All screens remain within the provider's 160-character bound; both languages have educator review.
5. `STOP` prevents further nudges and removes phone ciphertext; no nudges go to a learner who did not opt in.
6. The nudge worker respects quiet hours, four-per-month cap, and one-per-new-turn limit.
7. Provider callback URLs, webhook token, API/database connectivity, outbound balance, and delivery reports are configured and verified separately.

Passing unit tests cannot prove an Africa's Talking sandbox callback or Live handset delivery. The new migrations must be applied to Supabase before these features can use the hosted database.

## References for review

- [KICD Junior School curriculum designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/junior-school-designs/)
- [KNBS 2016 MSME survey](https://www.knbs.or.ke/2016-micro-small-and-medium-enterprises-msme-survey-basic-report/)
- [WHO WASH facility guidance](https://www.who.int/publications/i/item/9789240095366)
- [SASRA frequently asked questions](https://www.sasra.go.ke/frequently-asked-questions/)
- [Office of the Data Protection Commissioner: Kenya data protection laws](https://www.odpc.go.ke/data-protection-laws-kenya/)
- [Africa's Talking USSD callback guidance](https://help.africastalking.com/en/articles/9915125-how-do-i-go-live-with-ussd)
