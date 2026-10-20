import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CorrectionsView } from "./corrections-view";

const invalidateQueriesMock = jest.fn();
const removeMutateMock = jest.fn();
const removeAllMutateMock = jest.fn();

const correctionsByType = {
  all: [
    {
      id: "c-1",
      original: "I am agree",
      corrected: "I agree",
      type: "grammar",
      note: "Falta usar el verbo en presente sin 'am'.",
      meetingName: "Entrevista 1",
      createdAt: "2025-01-07T00:00:00.000Z",
    },
    {
      id: "c-2",
      original: "I have a lot of stress",
      corrected: "I have a lot of pressure",
      type: "vocabulary",
      note: "Se recomienda un término más preciso para contexto técnico.",
      meetingName: "Entrevista 2",
      createdAt: "2025-01-15T00:00:00.000Z",
    },
    {
      id: "c-3",
      original: "The API is connect to database",
      corrected: "The API connects to the database",
      type: "technical",
      note: "Se corrige la concordancia y la preposición de conexión.",
      meetingName: "Entrevista 3",
      createdAt: "2025-02-03T00:00:00.000Z",
    },
  ],
  grammar: [
    {
      id: "c-1",
      original: "I am agree",
      corrected: "I agree",
      type: "grammar",
      note: "Falta usar el verbo en presente sin 'am'.",
      meetingName: "Entrevista 1",
      createdAt: "2025-01-07T00:00:00.000Z",
    },
  ],
  vocabulary: [
    {
      id: "c-2",
      original: "I have a lot of stress",
      corrected: "I have a lot of pressure",
      type: "vocabulary",
      note: "Se recomienda un término más preciso para contexto técnico.",
      meetingName: "Entrevista 2",
      createdAt: "2025-01-15T00:00:00.000Z",
    },
  ],
  technical: [
    {
      id: "c-3",
      original: "The API is connect to database",
      corrected: "The API connects to the database",
      type: "technical",
      note: "Se corrige la concordancia y la preposición de conexión.",
      meetingName: "Entrevista 3",
      createdAt: "2025-02-03T00:00:00.000Z",
    },
  ],
};

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
  },
}));

jest.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    corrections: {
      getMany: {
        queryOptions: (queryKey: Record<string, string> = {}) => ({
          queryKey: ["corrections", "getMany", queryKey],
        }),
      },
      remove: {
        mutationOptions: (options: Record<string, unknown> = {}) => ({
          mutationKey: ["corrections", "remove"],
          ...options,
        }),
      },
      removeAll: {
        mutationOptions: (options: Record<string, unknown> = {}) => ({
          mutationKey: ["corrections", "removeAll"],
          ...options,
        }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn((options) => {
    const queryKey = options?.queryKey ?? [];
    const filter = queryKey[2]?.type ?? "all";

    return {
      data: correctionsByType[filter as keyof typeof correctionsByType] ?? [],
      isLoading: false,
    };
  }),
  useMutation: jest.fn((options) => ({
    mutate: (...args: any[]) => {
      const mutationKey = options?.mutationKey ?? [];

      if (mutationKey[1] === "remove") {
        removeMutateMock(...args);
      }

      if (mutationKey[1] === "removeAll") {
        removeAllMutateMock(...args);
      }

      if (typeof options?.onSuccess === "function") {
        options.onSuccess();
      }
    },
    isPending: false,
  })),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

describe("CorrectionsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
  });

  test("muestra el glosario general con todas las correcciones", () => {
    render(<CorrectionsView />);

    expect(screen.getByText("Mi Glosario")).toBeInTheDocument();
    expect(screen.getByText("Correcciones acumuladas de tus entrevistas de práctica")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Gramática" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Vocabulario" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Técnico" })).toBeInTheDocument();

    expect(screen.getByText("I am agree")).toBeInTheDocument();
    expect(screen.getByText("I have a lot of stress")).toBeInTheDocument();
    expect(screen.getByText("The API is connect to database")).toBeInTheDocument();
  });

  test("elimina una corrección individual", async () => {
    render(<CorrectionsView />);

    const targetCard = screen.getByText("I am agree").closest("div.rounded-xl");
    expect(targetCard).not.toBeNull();

    const removeButton = within(targetCard as HTMLElement).getByRole("button");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(removeMutateMock).toHaveBeenCalledWith({ id: "c-1" });
    });
  });

  

  test("muestra el estado vacío cuando la categoría no tiene resultados", () => {
    const baseData = correctionsByType;
    correctionsByType.all = [];
    correctionsByType.grammar = [];
    correctionsByType.vocabulary = [];
    correctionsByType.technical = [];

    render(<CorrectionsView />);

    expect(
      screen.getByText(/Aún no hay entradas en tu glosario/i)
    ).toBeInTheDocument();

    correctionsByType.all = baseData.all;
    correctionsByType.grammar = baseData.grammar;
    correctionsByType.vocabulary = baseData.vocabulary;
    correctionsByType.technical = baseData.technical;
  });
});
