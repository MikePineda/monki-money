# Changelog

## [0.4.2](https://github.com/MikePineda/monki-money/compare/v0.4.1...v0.4.2) (2026-10-21)


### Dependencies

* **deps-dev:** Bump the angular group across 1 directory with 2 updates ([#28](https://github.com/MikePineda/monki-money/issues/28)) ([2618a10](https://github.com/MikePineda/monki-money/commit/2618a10504ebb8ffb0c4b6033cff8b9812b6723a))
* **deps:** Bump the tooling group across 1 directory with 9 updates ([#32](https://github.com/MikePineda/monki-money/issues/32)) ([59af930](https://github.com/MikePineda/monki-money/commit/59af93009c145cc646bd23cfc323bdc348ae1a86))

## [0.4.1](https://github.com/MikePineda/monki-money/compare/v0.4.0...v0.4.1) (2026-10-16)


### Fixed

* honest month-to-date comparison, device language, import transfer labels, accounts error state ([#26](https://github.com/MikePineda/monki-money/issues/26)) ([7da30d6](https://github.com/MikePineda/monki-money/commit/7da30d620cda9ee1a07af082951c3cc85d64758b))

## [0.4.0](https://github.com/MikePineda/monki-money/compare/v0.3.0...v0.4.0) (2026-10-16)


### Added

* complete household export, ownership transfer and the leaving-member rule ([#21](https://github.com/MikePineda/monki-money/issues/21)) ([758280e](https://github.com/MikePineda/monki-money/commit/758280e7f736c5442516ae35a7c5c2d655b7b340))
* fewer Month calls, richer /auth/me, transfers by id, joint filter, server suggestions ([#23](https://github.com/MikePineda/monki-money/issues/23)) ([8a80eb7](https://github.com/MikePineda/monki-money/commit/8a80eb72e8071c644715fbc5d6a4fe91904d56ac))
* web push for the monthly summary and an opt-in daily reminder ([#24](https://github.com/MikePineda/monki-money/issues/24)) ([5a2d521](https://github.com/MikePineda/monki-money/commit/5a2d5214ee0095818849735cba9f63144cc1b908))

## [0.3.0](https://github.com/MikePineda/monki-money/compare/v0.2.0...v0.3.0) (2026-10-16)


### Added

* **api:** generate the monthly insight on the 1st with an in-process scheduler ([#16](https://github.com/MikePineda/monki-money/issues/16)) ([09564c6](https://github.com/MikePineda/monki-money/commit/09564c6c006c806f27b099d3a663bf4faeabeb46))
* **api:** resolve NAB transfers with a free memo to the linked account ([#7](https://github.com/MikePineda/monki-money/issues/7)) ([26c8beb](https://github.com/MikePineda/monki-money/commit/26c8beb7a0ca45003d68cf50f2ce5f177efa7d81))
* goal projections inline, month-end history and reached goals ([#19](https://github.com/MikePineda/monki-money/issues/19)) ([85dafd3](https://github.com/MikePineda/monki-money/commit/85dafd34868c86badfb54a7b90d65759e85eca90))
* import review polish (classify state, duplicates, bulk undo) ([#18](https://github.com/MikePineda/monki-money/issues/18)) ([5ef07ce](https://github.com/MikePineda/monki-money/commit/5ef07cef211fc5956b80f96e981fa8111f095f61))
* payslips with gross income and deductions linked to the bank transfer ([#12](https://github.com/MikePineda/monki-money/issues/12)) ([33083e2](https://github.com/MikePineda/monki-money/commit/33083e2b16dfdfa251f09aaa1b38f3b96efa25b4))
* recurring payments and the committed part of the month ([#15](https://github.com/MikePineda/monki-money/issues/15)) ([27c3ba2](https://github.com/MikePineda/monki-money/commit/27c3ba283749da5e8e3a9baeed95d1be4bbcafbc))
* tag filter and per-tag totals ([#14](https://github.com/MikePineda/monki-money/issues/14)) ([c4b10ba](https://github.com/MikePineda/monki-money/commit/c4b10ba238043836562f90f128ffbdc17dc403a9))
* **web:** create and edit merchant rules, show account balances and opening balance ([#11](https://github.com/MikePineda/monki-money/issues/11)) ([a7f036a](https://github.com/MikePineda/monki-money/commit/a7f036a5ceb6a3c1652a9c1a8df9ae2c97f98460))
* **web:** receipt scanner and offline outbox polish ([#20](https://github.com/MikePineda/monki-money/issues/20)) ([b7189f3](https://github.com/MikePineda/monki-money/commit/b7189f3fff1df1a5438ec2709597ec543f0bfa11))


### Fixed

* **api:** return rule counters on create and keep bank-default rules locked ([#13](https://github.com/MikePineda/monki-money/issues/13)) ([1caf80c](https://github.com/MikePineda/monki-money/commit/1caf80cf232a7c78501af57b70d57504955fe1dc))
* **web:** keep the initial bundle under budget and harden flaky tests ([#8](https://github.com/MikePineda/monki-money/issues/8)) ([2294dac](https://github.com/MikePineda/monki-money/commit/2294dacb2cc4fa6b356186c5bd5f57f13f0fb61d))
* **web:** review guessed transfer accounts and accept them in bulk ([#10](https://github.com/MikePineda/monki-money/issues/10)) ([3d5d240](https://github.com/MikePineda/monki-money/commit/3d5d24015e85e1e8745e29fcc42e9ba656aad5f9))
* **web:** show confirmed import rows as done and isolate the blocking ones ([#4](https://github.com/MikePineda/monki-money/issues/4)) ([37be9ef](https://github.com/MikePineda/monki-money/commit/37be9efa00bf04283f5531cefe6d1c2d006a5150))


### Dependencies

* **e2e:** give every E2E run its own stack slot ([#9](https://github.com/MikePineda/monki-money/issues/9)) ([536afc8](https://github.com/MikePineda/monki-money/commit/536afc857fd25879755b14d37c81c49bd65f11f6))

## [0.2.0](https://github.com/MikePineda/monki-money/compare/v0.1.0...v0.2.0) (2026-10-16)


### Added

* **api:** add an object storage abstraction for direct uploads ([7722ef3](https://github.com/MikePineda/monki-money/commit/7722ef386d3b90e10da65dbd3e40299ca734f215))
* **api:** add auth, household, accounts and categories endpoints ([838779e](https://github.com/MikePineda/monki-money/commit/838779e5fb1c5f42fed5049bb8c69e0314af838e))
* **api:** add LLM-written monthly insights ([6a1f162](https://github.com/MikePineda/monki-money/commit/6a1f1626d00114f44801d588cdf75163ca0ae2be))
* **api:** add savings goals and monthly insights tables ([663cfde](https://github.com/MikePineda/monki-money/commit/663cfdec9b00e6a8ce6fd77c0a4fc9a37fb7ec97))
* **api:** add savings goals endpoints with projection ([eaae6d2](https://github.com/MikePineda/monki-money/commit/eaae6d2147fa143e716b2c3f1ae444bbc28944e9))
* **api:** add storage:configure for upload CORS and receipt expiry ([f1b892b](https://github.com/MikePineda/monki-money/commit/f1b892b151f9e85e939aa6c63838f97f85e2d00f))
* **api:** add the import batches, rows and merchant rules with their services ([6cb247a](https://github.com/MikePineda/monki-money/commit/6cb247af6f09267ba76d653ec9459a97d912d665))
* **api:** add the imports and rules endpoints and the import:nab backfill command ([d01505a](https://github.com/MikePineda/monki-money/commit/d01505a667a03c76fe5d51580ca3b7b0c8f4f85e))
* **api:** add the ledger schema, models and pure reporting domain ([3a226be](https://github.com/MikePineda/monki-money/commit/3a226be8ce38ca79e596628bfdf79424d6a85151))
* **api:** add the LLM layer (MiniMax via the Anthropic SDK, fake, quota) ([b684efd](https://github.com/MikePineda/monki-money/commit/b684efdc829f2831da03f282e891ca81c75b9ba9))
* **api:** add the llm_usage table and shared LLM enums ([cc66fb2](https://github.com/MikePineda/monki-money/commit/cc66fb22c81196e2a19d23565c21af037793dc01))
* **api:** add the llm:smoke command and the LLM docs ([faf9259](https://github.com/MikePineda/monki-money/commit/faf925983f67569434cf79c146ee6444a1a8869c))
* **api:** add the NAB CSV parser and the pure import domain ([0761187](https://github.com/MikePineda/monki-money/commit/0761187646f11f85c870f190232b73a671b84223))
* **api:** add the tenancy schema, models and shared taxonomy ([4daa086](https://github.com/MikePineda/monki-money/commit/4daa0864d00281b2b56cab5331c11eafb233889e))
* **api:** add transactions, transfers and reports endpoints ([01d7209](https://github.com/MikePineda/monki-money/commit/01d72094eb15d12cd49d78630ee3d94aaae79ef5))
* **api:** align the LLM suggester with the classify contract ([bd69c25](https://github.com/MikePineda/monki-money/commit/bd69c254fcebf472580c559e4505961a733f8fa7))
* **api:** auth, households, accounts and categories foundation ([6774ffd](https://github.com/MikePineda/monki-money/commit/6774ffd671fb325de1c431a2b94e55fbe3ea78b7))
* **api:** import service, review endpoints, merchant rules and NAB backfill command ([c1615be](https://github.com/MikePineda/monki-money/commit/c1615be8b5f4e8b51b37d1a81589d181c4d19d62))
* **api:** ledger — transactions, transfers, splits, reports, privacy, CSV export ([9cd0c94](https://github.com/MikePineda/monki-money/commit/9cd0c94813cf59aa825a6e2e90657b2465fd53bd))
* **api:** let a member leave the household ([d7523ec](https://github.com/MikePineda/monki-money/commit/d7523ecbfbed1a0cc3c9e5463ba5a1e08d482fdf))
* **api:** let a verified user without a household create one ([7906131](https://github.com/MikePineda/monki-money/commit/7906131cc86f3a4d4ce2f4471d1ffbc1de4e6c63))
* **api:** let POST /transactions record a scanned receipt as its source ([291a888](https://github.com/MikePineda/monki-money/commit/291a8885ec42430cf231188e144fda2c0a45bf59))
* **api:** NAB CSV parser, row hashing, matcher and category suggesters (pure domain) ([78c7e59](https://github.com/MikePineda/monki-money/commit/78c7e59bb3a8724539893c17baa3a04b8f27f8e2))
* **api:** presign direct uploads of receipt photos ([70e9221](https://github.com/MikePineda/monki-money/commit/70e922114c88fe792785a5983975f64be4e8aaf5))
* **api:** project savings goals from the average monthly net ([7bdb0f9](https://github.com/MikePineda/monki-money/commit/7bdb0f967721a12a424f8896c9ee62bf77131a6a))
* **api:** receipt scanner with direct-to-bucket uploads ([a838c97](https://github.com/MikePineda/monki-money/commit/a838c970c8daa81f415ca70f06bae2ef821b9fd5))
* **api:** savings goals with projections and monthly insights ([c3c5b05](https://github.com/MikePineda/monki-money/commit/c3c5b052ee83e99bddb51c989afbcc5a0417f025))
* **api:** scan uploaded receipt photos with the vision model ([2ff4817](https://github.com/MikePineda/monki-money/commit/2ff48179283bc9ade583bd46211b128a3a67f4d0))
* **api:** seed a smoke user in its own household from SMOKE_EMAIL/SMOKE_PASSWORD ([e2b69f1](https://github.com/MikePineda/monki-money/commit/e2b69f1f160b16456ab756b59f53b960ba55ab45))
* **api:** swappable LLM provider layer (Anthropic-compatible, fake, usage, quota) ([bb6ebf9](https://github.com/MikePineda/monki-money/commit/bb6ebf9eb7fa65b594351a4d7159b50d049281e0))
* **api:** turnstile behind env, 6-digit verification code, leave and create household ([7191960](https://github.com/MikePineda/monki-money/commit/7191960ebc6d89d6e51a92b6ddfde774aa91a5b6))
* **api:** verify Cloudflare Turnstile on sign-up, login and forgot password ([6729595](https://github.com/MikePineda/monki-money/commit/6729595f782021fe7c37418a2e8a8f970df71aff))
* **api:** verify the email with a 6-digit code as well as the link ([6771976](https://github.com/MikePineda/monki-money/commit/677197685f3d5af4dbc8fa9cc89adbe1d5a0217a))
* **ops:** Bruno smoke collection, smoke user, /ship and /pulse skills ([033e468](https://github.com/MikePineda/monki-money/commit/033e468779eb10ab82852355a78b8e580f57511f))
* **web:** add auth, onboarding, invitation and settings screens ([3781388](https://github.com/MikePineda/monki-money/commit/3781388aac56f8567d977a9f5920a00b8d1c53dd))
* **web:** add design tokens, self-hosted Inter and the PWA manifest ([18f5b09](https://github.com/MikePineda/monki-money/commit/18f5b09306b6538a7d39ef7abd60cb80da30641e))
* **web:** add i18n, theme store, toasts and PWA update services ([86e774d](https://github.com/MikePineda/monki-money/commit/86e774d3f28ffde38914f4c280e3103b1db7f65f))
* **web:** add markdown-lite, relative time, reorder and goal domain helpers ([5171726](https://github.com/MikePineda/monki-money/commit/51717261a3ccabc07a64ed5274469f81835cd894))
* **web:** add month store, ledger data access and pure quick-add and insight rules ([abb410c](https://github.com/MikePineda/monki-money/commit/abb410c421820f17ea4ec15ccbc068c06929a6e8))
* **web:** add pure chart layout math in domain/charts ([f67c927](https://github.com/MikePineda/monki-money/commit/f67c927fc43b5104fdf45006a7c7e47c0e7bb109))
* **web:** add pure money, month and locale domain helpers ([b437e43](https://github.com/MikePineda/monki-money/commit/b437e43806f424677be9649a1953798b4442c582))
* **web:** add shared chart components with table views ([72afca5](https://github.com/MikePineda/monki-money/commit/72afca53e49ee9591e02560df814eadfe73c1ef4))
* **web:** add the app shell, placeholder tabs and the ui-kit gallery ([6666117](https://github.com/MikePineda/monki-money/commit/6666117aeb4e5fb9125123e5adf171800f9a5bb6))
* **web:** add the charts gallery and apply visual QA fixes ([b363901](https://github.com/MikePineda/monki-money/commit/b3639016b955a14b6cc66890170498d2ce2ce46c))
* **web:** add the goal card, form, stat and delete confirmation parts ([aef9901](https://github.com/MikePineda/monki-money/commit/aef990152c54959a9c237183ac5363d3463a8fd9))
* **web:** add the goals data access, catalogue and list/detail stores ([832bc36](https://github.com/MikePineda/monki-money/commit/832bc363003f4ba07486235f1616a5ec36290cc6))
* **web:** add the insights data access and store with a per-month cache ([2bf471d](https://github.com/MikePineda/monki-money/commit/2bf471dcb968a6bf4186dde0a8c306d0020eee16))
* **web:** add the pure offline outbox domain module ([2332b55](https://github.com/MikePineda/monki-money/commit/2332b55d44a5ba7172036ec94d8b98cae64e8bc4))
* **web:** add the savings goals screens and their entry under More ([1e561c2](https://github.com/MikePineda/monki-money/commit/1e561c2e21e5724818c0aeda3919c2086d6df4ff))
* **web:** add the session store, route guards and a lazy API client ([84e1d21](https://github.com/MikePineda/monki-money/commit/84e1d2116c0c6b39db326aa78f16e520c327b32c))
* **web:** add the ui-kit with CDK harnesses ([dcbe345](https://github.com/MikePineda/monki-money/commit/dcbe3458e12573fde67d5c69a5b7d7650e39a736))
* **web:** add transactions list, edit and split sheets, and categories screen ([7e4dfba](https://github.com/MikePineda/monki-money/commit/7e4dfba1b842de21eae58fd5d1d1f5321d6bce71))
* **web:** auth, onboarding, invitations and settings screens ([feda5ca](https://github.com/MikePineda/monki-money/commit/feda5ca5604d9d5f25f0e2031a29565f1761cf85))
* **web:** bank import upload, review and result screens ([99f7e79](https://github.com/MikePineda/monki-money/commit/99f7e792c314bda68e92acbf7902bca4ac121146))
* **web:** build quick add and the month view ([ece9615](https://github.com/MikePineda/monki-money/commit/ece96156b0154d7a4269f5b5adb43603f558e26c))
* **web:** confirm the email with the 6-digit code on the verify screen ([f5104b2](https://github.com/MikePineda/monki-money/commit/f5104b2e19e580f8b5949ca1a0da127fd2cf7c5a))
* **web:** csv import screens, review pattern and merchant rules ([a176543](https://github.com/MikePineda/monki-money/commit/a176543b0a3ccb971aaa15fa6d3d863f72280d0d))
* **web:** design tokens, ui-kit, i18n, theme and PWA shell ([90a9a87](https://github.com/MikePineda/monki-money/commit/90a9a87382d12a628f26bd11079d9ec881783833))
* **web:** import data access and the upload and review stores ([4b71ff3](https://github.com/MikePineda/monki-money/commit/4b71ff3cbdce3355cb24e5be93bf51421bbbc57e))
* **web:** import review row state machine and upload outcomes ([4f96ffd](https://github.com/MikePineda/monki-money/commit/4f96ffdafe51672a78a6fddf2314fc902cb2bc74))
* **web:** let a member leave the household from settings ([c695589](https://github.com/MikePineda/monki-money/commit/c6955899bb1854cd4e6d709737f754e74447cfd9))
* **web:** let a verified user without a household create one ([35d643b](https://github.com/MikePineda/monki-money/commit/35d643b93fe6590539c66e3d9f0d1901ab61e40f))
* **web:** mark a target month on the projection chart ([44a3cf6](https://github.com/MikePineda/monki-money/commit/44a3cf649aa7657218057159e3bcba54421fca49))
* **web:** merchant rules screen and import entries in settings ([00c9283](https://github.com/MikePineda/monki-money/commit/00c92834be622e7f0455ef28e9835be5767dc55d))
* **web:** offline outbox for quick add with a sync pill ([130f537](https://github.com/MikePineda/monki-money/commit/130f5371e3553d4061d85a4dfa2d2be5105af7a6))
* **web:** open the receipt scanner from quick add and the More menu ([fbc9649](https://github.com/MikePineda/monki-money/commit/fbc964986743497b43aa3d0ff6103b47a69f1dc0))
* **web:** optimise receipt photos on the device before upload ([148ef25](https://github.com/MikePineda/monki-money/commit/148ef25152de71e031afd26383b4170601142071))
* **web:** queue quick add entries in the outbox when offline ([870dc10](https://github.com/MikePineda/monki-money/commit/870dc107b0752e6213a20924c92c235615b09e97))
* **web:** quick add and month view ([f4fe417](https://github.com/MikePineda/monki-money/commit/f4fe417ba9f431f603c45a1a445727a61897e83c))
* **web:** receipt draft defaults and split-by-lines rules ([813e742](https://github.com/MikePineda/monki-money/commit/813e742d6aad2ed7eed23e964c8e9d28bc237122))
* **web:** receipt review store saves the draft as a receipt expense ([f1737ca](https://github.com/MikePineda/monki-money/commit/f1737ca6cc320e07ddb5286f86379529872f906f))
* **web:** receipt scan store with direct upload and scan ([61f0b37](https://github.com/MikePineda/monki-money/commit/61f0b37c23ad122520dafb2ccfc7fae3e8b3b57f))
* **web:** receipt scanner screen at /scan with capture and review ([8e03366](https://github.com/MikePineda/monki-money/commit/8e03366969c0a65eb53860b557e1816c36decbe9))
* **web:** receipt scanner with direct-to-bucket upload ([fa49e23](https://github.com/MikePineda/monki-money/commit/fa49e23fead858fd0bc8040b5e808ac9b3c0fc53))
* **web:** refresh the household directory behind quick add ([7e6c624](https://github.com/MikePineda/monki-money/commit/7e6c624aa3b3bce35e9be8b0439d36dd206e8666))
* **web:** render the Cloudflare Turnstile check on login, sign-up and forgot password ([0535f77](https://github.com/MikePineda/monki-money/commit/0535f7741526ac8b16deea0e0f7866b2fa635278))
* **web:** reusable review list, row triage and bulk bar ([42f3fe4](https://github.com/MikePineda/monki-money/commit/42f3fe4db41d4270c69e30396131ac1d52a324e9))
* **web:** savings goals screens and the monthly insight card ([d41efcb](https://github.com/MikePineda/monki-money/commit/d41efcbd6e3cb90915bcf1864e902e8d22d15b86))
* **web:** show a sync pill and an outbox sheet in the app shell ([631027c](https://github.com/MikePineda/monki-money/commit/631027c5deb9b397eb208b85302608933bfd9591))
* **web:** show the AI-written monthly summary in the Month view ([dc9ad6a](https://github.com/MikePineda/monki-money/commit/dc9ad6a9b096d17709ff86802e11899551766d55))
* **web:** SVG chart kit (bar list, trend line, stacked 100, projection, sparkline) ([c341a40](https://github.com/MikePineda/monki-money/commit/c341a4010857ba19ba690664eb50501577d42739))
* **web:** sync the offline outbox through a root store ([d1bc4f2](https://github.com/MikePineda/monki-money/commit/d1bc4f245918615ca77cdb1e9deb44bf2070461c))
* **web:** the empty month always offers the bank import ([ce8df41](https://github.com/MikePineda/monki-money/commit/ce8df41e76affbd8bdcd63a0f9b5c3c9d73014b8))
* **web:** transactions list, transaction and split sheets, categories management ([3213d0b](https://github.com/MikePineda/monki-money/commit/3213d0bc80940a7f39b32f6ce8667d533fe5f7ef))
* **web:** turnstile widget, verify by code, leave and create household ([e49aeee](https://github.com/MikePineda/monki-money/commit/e49aeee6c80e47b6691d678711786ce21c6e7827))
* **web:** upload service puts a file straight to a presigned URL ([5d0d669](https://github.com/MikePineda/monki-money/commit/5d0d669d8245135eb69637e1d8df7024eca68916))
* **web:** upload service with real progress and error payload extras ([46f6a3f](https://github.com/MikePineda/monki-money/commit/46f6a3fcf104340ffb3e9219f960169d24993694))


### Fixed

* **api:** answer POST /households with the same shapes as GET /auth/me ([3517c65](https://github.com/MikePineda/monki-money/commit/3517c652a5492c20cd00d957238df71d22310303))
* **api:** close the import review findings ([60de142](https://github.com/MikePineda/monki-money/commit/60de142470aa2f12743f03c756a3e72dfe83e30a))
* **api:** lock ledger rows on write and close the review findings ([f2d7b35](https://github.com/MikePineda/monki-money/commit/f2d7b352d2fc020d4306360bec9378e49f23f5a6))
* **api:** read index-signature members with brackets for the web's strict typecheck ([d7af019](https://github.com/MikePineda/monki-money/commit/d7af0197fba00f4e98609508461067d612019417))
* **api:** resolve the hasher lazily and seed the e2e household ([5cd7f59](https://github.com/MikePineda/monki-money/commit/5cd7f5936d89861cc1f1409b5672c5e559c012dd))
* **e2e:** give the E2E API build the fake LLM fixtures ([a1690e4](https://github.com/MikePineda/monki-money/commit/a1690e49fabf060d8aa17870fd2148a28c0da594))
* tear down the e2e stack even after changing directory ([#4](https://github.com/MikePineda/monki-money/issues/4)) ([db07508](https://github.com/MikePineda/monki-money/commit/db07508fcad3c3b644df0678c9e5c9a6cf940f48))
* **web:** a blocked bucket upload while online is not reported as offline ([e1bb678](https://github.com/MikePineda/monki-money/commit/e1bb6787e329254d1016c415fb29e68500b418d2))
* **web:** apply visual QA fixes from the 390px light and dark review ([2116f59](https://github.com/MikePineda/monki-money/commit/2116f59574467779218a5d94269ff9f1723f0943))
* **web:** call joint payers Shared in the import screens like elsewhere ([4541998](https://github.com/MikePineda/monki-money/commit/4541998d2fd15e15138fed463c9dec9fcca4143e))
* **web:** keep a bulk refusal on screen instead of a zero-count toast ([6c66433](https://github.com/MikePineda/monki-money/commit/6c664336dac454b2516cbe9a6e0f40fb6b4543ed))
* **web:** keep quick add usable after a save and re-check the session per tab ([91187d1](https://github.com/MikePineda/monki-money/commit/91187d1c093207afe6394edcb42597d956832d77))
* **web:** keep the PWA service worker from proxying the Turnstile script ([4da3720](https://github.com/MikePineda/monki-money/commit/4da3720d47a3ee75eb0bc5d5b77a63e297476e6d))
* **web:** lay the goal figures out two by two and label the target inside the plot ([acd24d1](https://github.com/MikePineda/monki-money/commit/acd24d17f7d71c1417a1d210793a68f323bfff95))
* **web:** open quick add offline with the accounts already loaded ([4691f49](https://github.com/MikePineda/monki-money/commit/4691f495df098f370cc43d05c4402d9497f43c37))


### Security

* **api:** harden invitations, throttles, tokens and error output ([784284c](https://github.com/MikePineda/monki-money/commit/784284cf56a828bcb36af85e16fab4deda17b10e))
* **api:** reject merchant regex rules that can backtrack catastrophically ([31cef38](https://github.com/MikePineda/monki-money/commit/31cef38fb0f09ecebe4148184847eb86fb8b2851))
* **api:** use scrypt N=2^16 p=2 to halve per-hash memory ([2e788d6](https://github.com/MikePineda/monki-money/commit/2e788d6494ba646ccc519b1a81aa514d4b1091f7))


### Changed

* **api:** look for the smoke user's housemates without $extras ([5340385](https://github.com/MikePineda/monki-money/commit/53403856f36a9efc71508105a7e957fd15445aee))
* **api:** share the model's category choices between features ([d60c6fd](https://github.com/MikePineda/monki-money/commit/d60c6fd4675f86f3dad363d2f4abd6a155c29c33))
* **web:** build create bodies from the shared transaction form drafts ([df3301d](https://github.com/MikePineda/monki-money/commit/df3301dfaac4d79d68aeddfc165aa8a58354e9d8))
* **web:** keep validationRules out of the initial bundle ([c0c7bde](https://github.com/MikePineda/monki-money/commit/c0c7bdeaebef0b3ce4015b652e8d0047df115233))
* **web:** share one transaction and transfer form between quick add and the sheets ([b8500d9](https://github.com/MikePineda/monki-money/commit/b8500d96173d1b205dd57751a60fbdd5bea5958f))
* **web:** the last used account key lives in core/platform ([fd66a69](https://github.com/MikePineda/monki-money/commit/fd66a69de60691d12edc02fe6303f509d35dc454))


### Dependencies

* add production image and local stacks ([83ba3a7](https://github.com/MikePineda/monki-money/commit/83ba3a7e3ccca4533666f76a9f2eb268b3ea81ae))
* **deps:** Bump the tooling group across 1 directory with 2 updates ([#1](https://github.com/MikePineda/monki-money/issues/1)) ([4ab261f](https://github.com/MikePineda/monki-money/commit/4ab261f47287a7daea7276dcb939a26478960a84))
* **docker:** keep sharp's prebuilt binaries in the runtime image ([4fbe872](https://github.com/MikePineda/monki-money/commit/4fbe872efaa83c1e0fed89b14e65713cc1ac8077))

## Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). This file is generated by
release-please from Conventional Commits: do not edit it by hand. The open
release pull request is the "Unreleased" section.
