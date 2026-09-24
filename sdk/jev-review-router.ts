export const REVIEWERS = [
  "swiftui-expert",
  "swift-concurrency-expert",
  "swift-testing-expert",
] as const;

export type Reviewer = (typeof REVIEWERS)[number];

export const PROVIDERS = ["claude", "codex", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];

type JevResponse = {
  answers: Record<string, { type: "noul"; noul: number }>;
};

type JevRouteResponse = {
  answers: Record<string, { noul?: number; choice?: string }>;
};

const threshold = 0.75;

export function reviewersFromProbabilities(
  probabilities: Partial<Record<Reviewer, number>>,
): Reviewer[] {
  const selected = REVIEWERS.filter((reviewer) => probabilities[reviewer] >= threshold);
  return selected.length ? selected : [...REVIEWERS];
}

export function selectAgents<T>(
  agents: Record<Reviewer, T>,
  reviewers: Reviewer[],
): Record<string, T> {
  return Object.fromEntries(reviewers.map((reviewer) => [reviewer, agents[reviewer]]));
}

export function providerFromChoice(available: Provider[], choice: string): Provider {
  return available.includes(choice as Provider) ? (choice as Provider) : available[0];
}

export async function routeWithJev(
  task: string,
  available: Provider[],
  apiKey = process.env.TYPESAFE_API_KEY,
): Promise<{ provider: Provider; reviewers: Reviewer[] }> {
  if (!available.length) throw new Error("At least one provider is required");
  if (!apiKey || !task.trim()) return { provider: available[0], reviewers: [...REVIEWERS] };

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: { task, available_providers: available },
        questions: {
          provider: {
            type: "choice",
            instructions: "Select the available coding-agent runtime explicitly requested or best matched by this task.",
            criteria: Object.fromEntries(available.map((provider) => [provider, `${provider} is available for this task.`])),
          },
          "swiftui-expert": {
            type: "noul",
            instructions: "Does this iOS review task require SwiftUI expertise?",
            criteria: { true: "Views, state, navigation, rendering, accessibility, or SwiftUI performance are in scope.", false: "None of those SwiftUI concerns are in scope." },
          },
          "swift-concurrency-expert": {
            type: "noul",
            instructions: "Does this iOS review task require Swift Concurrency expertise?",
            criteria: { true: "async/await, actors, Sendable, isolation, or data-race safety are in scope.", false: "None of those concurrency concerns are in scope." },
          },
          "swift-testing-expert": {
            type: "noul",
            instructions: "Does this iOS review task require Swift testing expertise?",
            criteria: { true: "Swift Testing, XCTest, test quality, coverage, or flaky tests are in scope.", false: "None of those testing concerns are in scope." },
          },
        },
      }),
    });
    if (!response.ok) return { provider: available[0], reviewers: [...REVIEWERS] };

    const { answers } = (await response.json()) as JevRouteResponse;
    return {
      provider: providerFromChoice(available, answers.provider?.choice ?? ""),
      reviewers: reviewersFromProbabilities(
        Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, answers[reviewer]?.noul ?? 0])) as Partial<Record<Reviewer, number>>,
      ),
    };
  } catch {
    return { provider: available[0], reviewers: [...REVIEWERS] };
  }
}

export async function routeProviderWithJev(
  task: string,
  available: Provider[],
  apiKey = process.env.TYPESAFE_API_KEY,
): Promise<Provider> {
  if (!available.length) throw new Error("At least one provider is required");
  if (!apiKey || !task.trim()) return available[0];

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: { task, available_providers: available },
        questions: {
          provider: {
            type: "choice",
            instructions:
              "Select the available coding-agent runtime explicitly requested or best matched by this task.",
            criteria: Object.fromEntries(
              available.map((provider) => [
                provider,
                `${provider} is available for this task; choose it only when the task names it or needs its installed project adapter.`,
              ]),
            ),
          },
        },
      }),
    });

    if (!response.ok) return available[0];
    const { answers } = (await response.json()) as {
      answers: Record<string, { type: "choice"; choice: string }>;
    };
    return providerFromChoice(available, answers.provider?.choice ?? "");
  } catch {
    return available[0];
  }
}

export async function routeReviewWithJev(
  task: string,
  apiKey = process.env.TYPESAFE_API_KEY,
): Promise<Reviewer[]> {
  if (!apiKey || !task.trim()) return [...REVIEWERS];

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: { task },
        questions: {
          "swiftui-expert": {
            type: "noul",
            instructions: "Does this iOS review task require SwiftUI expertise?",
            criteria: {
              true: "Views, state, navigation, rendering, accessibility, or SwiftUI performance are in scope.",
              false: "None of those SwiftUI concerns are in scope.",
            },
          },
          "swift-concurrency-expert": {
            type: "noul",
            instructions: "Does this iOS review task require Swift Concurrency expertise?",
            criteria: {
              true: "async/await, actors, Sendable, isolation, or data-race safety are in scope.",
              false: "None of those concurrency concerns are in scope.",
            },
          },
          "swift-testing-expert": {
            type: "noul",
            instructions: "Does this iOS review task require Swift testing expertise?",
            criteria: {
              true: "Swift Testing, XCTest, test quality, coverage, or flaky tests are in scope.",
              false: "None of those testing concerns are in scope.",
            },
          },
        },
      }),
    });

    if (!response.ok) return [...REVIEWERS];

    const { answers } = (await response.json()) as JevResponse;
    return reviewersFromProbabilities(
      Object.fromEntries(
        REVIEWERS.map((reviewer) => [reviewer, answers[reviewer]?.noul ?? 0]),
      ) as Partial<Record<Reviewer, number>>,
    );
  } catch {
    return [...REVIEWERS];
  }
}
