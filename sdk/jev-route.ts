import {
  PROVIDERS,
  type Provider,
  routeWithJev,
} from "./jev-review-router.ts";

function availableProviders(value = process.env.IOS_AGENT_PROVIDERS ?? PROVIDERS.join(",")): Provider[] {
  const providers = value.split(",").filter((provider): provider is Provider =>
    PROVIDERS.includes(provider.trim() as Provider),
  );
  if (!providers.length) throw new Error("IOS_AGENT_PROVIDERS must contain claude, codex, or gemini");
  return [...new Set(providers)];
}

const task = process.argv.slice(2).join(" ").trim();
if (!task) throw new Error('Usage: bun run sdk/jev-route.ts "Review this SwiftUI screen"');

const providers = availableProviders();
console.log(JSON.stringify(await routeWithJev(task, providers)));
