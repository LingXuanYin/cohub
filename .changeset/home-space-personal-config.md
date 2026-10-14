---
"@neta-art/cohub": minor
---

Use the account's Home Space as the source of personal configuration. User Rules now return `source: "home-space"`. Saves in Home publish user rules, skills, prompts, and model configuration through the existing pipeline; the web app reads the personal theme from Home's `.cohub/theme.css`.

Existing config Spaces remain ordinary Spaces. Move the desired configuration files into Home before creating a Save there. No automatic migration or fallback is provided.
