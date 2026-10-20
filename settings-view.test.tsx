import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsView } from "./settings-view";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: jest.fn(),
  },
}));

jest.mock("@/components/ui/generated-avatar", () => ({
  GeneratedAvatar: ({ seed }: { seed: string }) => <div data-testid="generated-avatar">{seed}</div>,
}));

describe("SettingsView", () => {
  const signOutMock = authClient.signOut as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const user = {
    id: "user-1",
    name: "Ana García",
    email: "ana@alumno.ipn.mx",
    emailVerified: true,
    createdAt: new Date("2024-01-15T00:00:00.000Z"),
  };

  test("renderiza la información principal del usuario y el estado verificado", () => {
    render(<SettingsView user={user} />);

    expect(screen.getByText("Configuración de Cuenta")).toBeInTheDocument();
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("ana@alumno.ipn.mx")).toBeInTheDocument();
    expect(screen.getByText("✓ Verificado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar Información/i })).toBeInTheDocument();
  });

  test("permite editar el perfil y guardar cambios con toast de éxito", async () => {
    render(<SettingsView user={user} />);

    fireEvent.click(screen.getByRole("button", { name: /Editar Información/i }));

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Ana López" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ana.nueva@alumno.ipn.mx" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Guardar Cambios/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Perfil actualizado correctamente");
    });

    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("ana@alumno.ipn.mx")).toBeInTheDocument();
  });

  test("cierra la sesión y redirige al inicio de sesión", async () => {
    signOutMock.mockImplementation(({ fetchOptions }) => fetchOptions.onSuccess());

    render(<SettingsView user={user} />);

    fireEvent.click(screen.getByRole("button", { name: /Cerrar Sesión/i }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchOptions: expect.objectContaining({
            onSuccess: expect.any(Function),
          }),
        })
      );
    });

    expect(pushMock).toHaveBeenCalledWith("/sign-in");
  });

  test("elimina la cuenta desde la confirmación y redirige al dashboard", async () => {
    render(<SettingsView user={user} />);

    fireEvent.click(screen.getByRole("button", { name: /Eliminar Cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText("¿Estás completamente seguro?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Eliminar Cuenta/i })[1]);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Cuenta eliminada correctamente");
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });

  test("redirige al dashboard cuando se presiona volver", () => {
    render(<SettingsView user={user} />);

    fireEvent.click(screen.getByRole("button", { name: /Volver al Dashboard/i }));

    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });
});
