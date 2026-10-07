# Working with the owner

Last updated: 7 October 2026. How the owner wants work done. Read before starting any task.

- Instructions are short and informal ("fix it", "finish everything"). Finish end to end: code, tests, build,
  package or deploy, verify, push to `main`. Do not stop at a plan or ask onboarding questions; pick sensible defaults.
- Reports are concise: what changed, what was verified, what the owner must do. For routine web deploys, two or three
  lines (live URL, pass/fail).
- The Desktop holds only two folders: `Nomadic` (this repo) and `Nomadic Content`. Anything made for the owner (builds,
  images, videos, docs, SQL, exports) goes in a subfolder of `Desktop\Nomadic Content` (`App builds`, `Logo`, `Videos`,
  `SQL`, `Handoff and plans`, `Scraper`, `Carousel and marketing`), never loose on the Desktop. Builds also go to `Downloads`.
- Do not delete or publish things unasked; flag them. Do not sign in, sign up or submit forms against the live
  backend; the owner tests accounts. Do not print secrets from `.env`, Vault or tokens.
- Windows + PowerShell 5.1: no `&&`; write commit messages to a file with
  `[IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))` and `git commit -F path`
  (`Set-Content -Encoding utf8` adds a BOM). `git push` prints to stderr even on success.
- The owner's folders: repo at `Desktop\Nomadic`, everything else in `Desktop\Nomadic Content` (see above). The scraper
  folder is `Desktop\Nomadic Content\Scraper`.
