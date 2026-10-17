# CheckoutGuardian

I built this for the CreateOS x Stripe agent hackathon on October 17, 2026. It fixes broken checkout code and shows its work.

You give it a checkout module with failing tests. It runs the tests in a CreateOS sandbox, sends the failures and the source to an LLM, applies the files the model sends back, and runs the tests again in the same sandbox. If they still fail, the new error goes back to the model and it tries again, up to three times. At the end you get the original failure, a diff for each attempt, and the final test output.

Live demo: (add URL here)

## The broken store

`demo-store/checkout.js` has three bugs I planted:

- prices go to Stripe in dollars instead of integer cents
- `success_url` is missing `{CHECKOUT_SESSION_ID}`
- `cartTotal` throws on an empty cart

Three of the four tests in `demo-store/test` fail. The agent can't edit tests. Anything it returns under `test/` gets thrown away.

## How it's put together

- `agent/agent.js` is the loop. The sandbox part uses `@nodeops-createos/sandbox`. Files go in as base64 through `runCommand`, and the tests run with `node --test`.
- The LLM is called through OpenRouter.
- `server.js` serves the dashboard in `public/` and streams the agent's progress to the page.
- `report.json` is the output of my last run. It's committed so the dashboard has something to show before anyone clicks run.

I set up the CreateOS and OpenRouter accounts with Stripe Projects (`stripe projects add createos/project`, `stripe projects add openrouter/api`).

## Running it

You need Node 20.6 or newer and a `.env` with `CREATEOS_PROJECT_API_KEY` and `OPENROUTER_API_KEY`.

```
npm install
npm run agent:local   # runs the tests on your machine, no sandbox
npm run agent         # runs them in a CreateOS sandbox
npm run dev           # dashboard on http://localhost:8080
```

Set `LLM_MODEL` to pick a different OpenRouter model.

## What it doesn't do

- It only knows this demo store. It isn't a general tool.
- The store doesn't call Stripe. The tests check the parameters it would send. Test mode only, no real money anywhere.
- I ran it on a free OpenRouter model, which is slow. It needed one or two attempts in my runs.
- CreateOS Sandbox is in alpha, so the API may change.
- The run button works for anyone with the link. It allows one run at a time.
