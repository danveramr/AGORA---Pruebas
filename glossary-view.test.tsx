import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GlossaryView } from "./glossary-view";

const invalidateQueriesMock = jest.fn();
const createMutateMock = jest.fn();
const removeMutateMock = jest.fn();

let flashcards = [
  { id: "f-1", term: "Closure", definition: "Función que captura variables del entorno" },
  { id: "f-2", term: "Virtual DOM", definition: "Representación ligera del DOM" },
];

let dictionaryEntries = [
  {
    id: "d-1",
    word: "refactor",
    definition: "Reestructurar código sin cambiar comportamiento",
    partOfSpeech: "verb",
    phonetic: "/riːˈfæk.tər/",
    audioUrl: "https://example.com/refactor.mp3",
    letter: "r",
  },
  {
    id: "d-2",
    word: "abstraction",
    definition: "Idea general que oculta detalles de implementación",
    partOfSpeech: "noun",
    phonetic: "/æbˈstræk.ʃən/",
    audioUrl: null,
    letter: "a",
  },
];

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
  },
}));

jest.mock("@/components/ui/tabs", () => {
  const React = require("react");

  const TabsContext = React.createContext<{
    value: string;
    setValue: (value: string) => void;
  } | null>(null);

  function Tabs({ defaultValue = "flashcards", value, onValueChange, children }: any) {
    const [current, setCurrent] = React.useState(value ?? defaultValue);
    const contextValue = React.useMemo(
      () => ({
        value: value ?? current,
        setValue: (next: string) => {
          setCurrent(next);
          onValueChange?.(next);
        },
      }),
      [current, value, onValueChange]
    );

    return <TabsContext.Provider value={contextValue}>{children}</TabsContext.Provider>;
  }

  function TabsList({ children, ...props }: any) {
    return <div role="tablist" {...props}>{children}</div>;
  }

  function TabsTrigger({ value, children, ...props }: any) {
    const context = React.useContext(TabsContext);
    const active = context?.value === value;

    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        data-state={active ? "active" : "inactive"}
        onClick={() => context?.setValue(value)}
        {...props}
      >
        {children}
      </button>
    );
  }

  function TabsContent({ value, children, ...props }: any) {
    const context = React.useContext(TabsContext);
    if (context?.value !== value) return null;

    return (
      <div role="tabpanel" data-state="active" {...props}>
        {children}
      </div>
    );
  }

  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

jest.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    glossary: {
      getMany: { queryOptions: () => ({ queryKey: ["glossary", "getMany"] }) },
      create: { mutationOptions: (options = {}) => ({ mutationKey: ["glossary", "create"], ...options }) },
      remove: { mutationOptions: (options = {}) => ({ mutationKey: ["glossary", "remove"], ...options }) },
    },
    dictionary: {
      getMany: { queryOptions: () => ({ queryKey: ["dictionary", "getMany"] }) },
      create: { mutationOptions: (options = {}) => ({ mutationKey: ["dictionary", "create"], ...options }) },
      remove: { mutationOptions: (options = {}) => ({ mutationKey: ["dictionary", "remove"], ...options }) },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn((options) => {
    const key = options?.queryKey?.[0];

    if (key === "glossary") {
      return { data: flashcards, isLoading: false };
    }

    if (key === "dictionary") {
      return { data: dictionaryEntries, isLoading: false };
    }

    return { data: [], isLoading: false };
  }),
  useMutation: jest.fn((options) => ({
    mutate: (...args: any[]) => {
      const mutationKey = options?.mutationKey ?? [];

      if (mutationKey[1] === "create") {
        createMutateMock(...args);
      }

      if (mutationKey[1] === "remove") {
        removeMutateMock(...args);
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

describe("GlossaryView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    flashcards = [
      { id: "f-1", term: "Closure", definition: "Función que captura variables del entorno" },
      { id: "f-2", term: "Virtual DOM", definition: "Representación ligera del DOM" },
    ];
    dictionaryEntries = [
      {
        id: "d-1",
        word: "refactor",
        definition: "Reestructurar código sin cambiar comportamiento",
        partOfSpeech: "verb",
        phonetic: "/riːˈfæk.tər/",
        audioUrl: "https://example.com/refactor.mp3",
        letter: "r",
      },
      {
        id: "d-2",
        word: "abstraction",
        definition: "Idea general que oculta detalles de implementación",
        partOfSpeech: "noun",
        phonetic: "/æbˈstræk.ʃən/",
        audioUrl: null,
        letter: "a",
      },
    ];
  });

  test("muestra las flashcards guardadas", () => {
    render(<GlossaryView />);

    expect(screen.getByRole("heading", { name: "Glosario personal" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Flashcards" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Diccionario" })).toBeInTheDocument();
  });

  

  
test("muestra palabras guardadas en el diccionario agrupadas por letra", async () => {
  render(<GlossaryView />);

  const dictionaryTab = screen.getByRole("tab", { name: "Diccionario" });
  fireEvent.click(dictionaryTab);

  await waitFor(() => {
    expect(screen.getByText("refactor")).toBeInTheDocument();
  });

  expect(screen.getByText("abstraction")).toBeInTheDocument();
  expect(
    screen.getByText("Reestructurar código sin cambiar comportamiento")
  ).toBeInTheDocument();
});


  test("crea una nueva flashcard desde el formulario", async () => {
    render(<GlossaryView />);

    fireEvent.click(screen.getByRole("button", { name: /Nueva entrada/i }));
    fireEvent.change(screen.getByPlaceholderText("ej. Closure, Virtual DOM, REST..."), {
      target: { value: "Hoisting" },
    });
    fireEvent.change(screen.getByPlaceholderText("Explícalo con tus propias palabras..."), {
      target: { value: "Elevación de declaraciones en JavaScript" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(createMutateMock).toHaveBeenCalledWith(
        { term: "Hoisting", definition: "Elevación de declaraciones en JavaScript" }
      );
    });
  });

  
test("elimina una flashcard desde el botón de eliminar", async () => {
  render(<GlossaryView />);

  // Localiza la tarjeta que contiene la flashcard "Closure".
  const card = screen.getByText("Closure").closest("div.h-56");

  expect(card).not.toBeNull();

  // Voltea la tarjeta para mostrar la definición y el botón Eliminar.
  fireEvent.click(card as HTMLElement);

  // Busca y pulsa el botón de eliminación de esa tarjeta.
  fireEvent.click(
    within(card as HTMLElement).getByRole("button", { name: /Eliminar/i })
  );

  // Verifica que se solicite eliminar la flashcard correcta.
  await waitFor(() => {
    expect(removeMutateMock).toHaveBeenCalledWith({ id: "f-1" });
  });
});

});
