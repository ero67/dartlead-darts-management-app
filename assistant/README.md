# DartLead assistant

Python service for the in-app assistant (plan: Obsidian note "DartLead - Assistant Plan").
Managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
cd assistant
uv sync
cp .env.example .env   # then put your Google AI Studio key in .env
uv run hello           # asks Gemini one question
```
