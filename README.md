# Air Pollution Analyzer & Predictor

Air Pollution Analyzer and Predictor using public environmental data, interactive visualizations, and machine learning to analyze trends and forecast future air quality. The first version covers Dallas-Fort Worth. This is our CS 4485 senior project (Team T6).

## Folders

- `index.html`, `script.js`, `styles.css` - the dashboard (plain HTML, CSS, JavaScript), at the top so Vercel can find it
- `backend/` - FastAPI service that gets AirNow and weather data and sends it to the dashboard
- `docs/` - specs and notes (data spec goes here)

## Quick start

1. Backend: follow `backend/README.md` (needs an AirNow key in `backend/.env`).
2. Frontend: open `index.html` with Live Server, or run `python -m http.server 5500` in the main folder.
3. In `script.js`, set `USE_SAMPLE_DATA` to `false` to use the real backend.

In VS Code, install the recommended extensions when it asks, then press Ctrl+Shift+P, choose "Tasks: Run Task", and pick "Run everything".

## Working together

- Use a branch for each piece of work and open a pull request, so nobody overwrites anyone else.
- Never commit `.env` or any API keys. The template is `backend/.env.example`.
