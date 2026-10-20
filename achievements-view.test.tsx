import { render, screen, waitFor } from "@testing-library/react";
import { AchievementsView } from "./achievements-view";

const invalidateQueriesMock = jest.fn();
const markAllSeenMutateMock = jest.fn();

let achievements = [
  {
    id: "first_session",
    title: "Primera entrevista",
    description: "Completaste tu primera entrevista de práctica",
    emoji: "🎯",
    category: "sessions",
    earned: true,
    earnedAt: "2025-01-10T00:00:00.000Z",
  },
  {
    id: "sessions_5",
    title: "5 entrevistas",
    description: "Completaste 5 entrevistas de práctica",
    emoji: "⭐",
    category: "sessions",
    earned: false,
  },
  {
    id: "streak_3",
    title: "Racha de 3 días",
    description: "Practicaste 3 días consecutivos",
    emoji: "🔥",
    category: "streak",
    earned: true,
    earnedAt: "2025-01-12T00:00:00.000Z",
  },
  {
    id: "level_b1",
    title: "Nivel B1",
    description: "Alcanzaste nivel B1 en inglés",
    emoji: "📈",
    category: "level",
    earned: false,
  },
  {
    id: "no_skips",
    title: "Sin pausas",
    description: "Completaste una sesión sin saltar ninguna pregunta",
    emoji: "💎",
    category: "performance",
    earned: false,
  },
];

let stats = {
  currentStreak: 7,
  longestStreak: 14,
};

jest.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    gamification: {
      getAchievements: { queryOptions: () => ({ queryKey: ["gamification", "getAchievements"] }) },
      getStats: { queryOptions: () => ({ queryKey: ["gamification", "getStats"] }) },
      getUnseen: { queryOptions: () => ({ queryKey: ["gamification", "getUnseen"] }) },
      markAllSeen: { mutationOptions: (options = {}) => ({ mutationKey: ["gamification", "markAllSeen"], ...options }) },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn((options) => {
    const key = options?.queryKey?.[1];

    if (key === "getAchievements") {
      return { data: achievements, isLoading: false };
    }

    if (key === "getStats") {
      return { data: stats, isLoading: false };
    }

    return { data: [], isLoading: false };
  }),
  useMutation: jest.fn((options) => ({
    mutate: (...args: any[]) => {
      const mutationKey = options?.mutationKey ?? [];
      const mutateOptions = args[1] ?? {};

      if (mutationKey[1] === "markAllSeen") {
        markAllSeenMutateMock(args[0], mutateOptions);
      }

      if (typeof mutateOptions.onSuccess === "function") {
        mutateOptions.onSuccess();
      }
    },
    isPending: false,
  })),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

describe("AchievementsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    achievements = [
      {
        id: "first_session",
        title: "Primera entrevista",
        description: "Completaste tu primera entrevista de práctica",
        emoji: "🎯",
        category: "sessions",
        earned: true,
        earnedAt: "2025-01-10T00:00:00.000Z",
      },
      {
        id: "sessions_5",
        title: "5 entrevistas",
        description: "Completaste 5 entrevistas de práctica",
        emoji: "⭐",
        category: "sessions",
        earned: false,
      },
      {
        id: "streak_3",
        title: "Racha de 3 días",
        description: "Practicaste 3 días consecutivos",
        emoji: "🔥",
        category: "streak",
        earned: true,
        earnedAt: "2025-01-12T00:00:00.000Z",
      },
      {
        id: "level_b1",
        title: "Nivel B1",
        description: "Alcanzaste nivel B1 en inglés",
        emoji: "📈",
        category: "level",
        earned: false,
      },
      {
        id: "no_skips",
        title: "Sin pausas",
        description: "Completaste una sesión sin saltar ninguna pregunta",
        emoji: "💎",
        category: "performance",
        earned: false,
      },
    ];
    stats = { currentStreak: 7, longestStreak: 14 };
  });

  test("muestra el resumen, la racha y los logros por categoría", () => {
    render(<AchievementsView />);

    expect(screen.getByRole("heading", { name: "Logros" })).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "2 de 12 desbloqueados")).toBeInTheDocument();
    expect(screen.getByText("Progreso general")).toBeInTheDocument();
    expect(screen.getByText("Racha actual")).toBeInTheDocument();
    expect(screen.getByText("Mejor racha")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sesiones" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rachas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nivel de inglés" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rendimiento" })).toBeInTheDocument();
    expect(screen.getByText("Primera entrevista")).toBeInTheDocument();
    expect(screen.getByText("5 entrevistas")).toBeInTheDocument();
    expect(screen.getAllByText("Bloqueado").length).toBeGreaterThan(0);
  });

  test("marca todos los logros como vistos al montar la vista", async () => {
    render(<AchievementsView />);

    await waitFor(() => {
      expect(markAllSeenMutateMock).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["gamification", "getUnseen"],
    });
  });
});
