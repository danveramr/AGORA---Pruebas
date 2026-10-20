import { fireEvent, render, screen } from "@testing-library/react";
import { MeetingsView } from "./meetings-view";

const pushMock = jest.fn();
const setFiltersMock = jest.fn();

const meetingsData = {
  items: [
    {
      id: "meeting-1",
      name: "Entrevista de frontend",
      status: "completed",
      duration: 90061,
      agent: {
        id: "agent-1",
        name: "Alex",
        role: "Senior Frontend Engineer",
      },
      startedAt: "2026-10-15T10:00:00.000Z",
    },
    {
      id: "meeting-2",
      name: "Entrevista de product",
      status: "upcoming",
      duration: null,
      agent: {
        id: "agent-2",
        name: "Morgan",
        role: "Product Manager",
      },
      startedAt: null,
    },
  ],
  totalPages: 2,
};

jest.mock("@/components/ui/generated-avatar", () => ({
  GeneratedAvatar: ({ seed, className }: { seed: string; className?: string }) => (
    <div data-testid="generated-avatar" className={className}>{seed}</div>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock("@/components/data-table", () => ({
  DataTable: ({ data, onRowClick }: any) => (
    <div>
      {data.map((row: any) => (
        <button key={row.id} onClick={() => onRowClick(row)}>
          {row.name}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@/components/data-pagination", () => ({
  DataPagination: ({ page, totalPages, onPageChange }: any) => (
    <div>
      <span>
        Página {page} de {totalPages}
      </span>
      <button onClick={() => onPageChange(2)}>Ir a página 2</button>
    </div>
  ),
}));

jest.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    meetings: {
      getMany: {
        queryOptions: (options = {}) => ({ queryKey: ["meetings", "getMany", options] }),
      },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: jest.fn(() => ({ data: meetingsData })),
}));

jest.mock("../../hooks/use-meetings-filters", () => ({
  useMeetingsFilters: () => [{ page: 1 }, setFiltersMock],
}));

describe("MeetingsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renderiza el historial de entrevistas y navega al detalle correcto", () => {
    render(<MeetingsView />);

    expect(screen.getByRole("button", { name: "Entrevista de frontend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrevista de product" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Entrevista de frontend" }));

    expect(pushMock).toHaveBeenCalledWith("/meetings/meeting-1");
  });

  test("muestra el estado vacío del historial cuando no hay entrevistas registradas", () => {
    const { useSuspenseQuery } = require("@tanstack/react-query");
    useSuspenseQuery.mockReturnValueOnce({
      data: { items: [], totalPages: 1 },
    });

    render(<MeetingsView />);

    expect(screen.getByText("Sin entrevistas registradas")).toBeInTheDocument();
    expect(
      screen.getByText("Cuando completes una entrevista de práctica, aparecerá aquí con su resumen.")
    ).toBeInTheDocument();
  });
});
