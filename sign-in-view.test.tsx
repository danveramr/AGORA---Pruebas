import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignInView } from "./sign-in-view";
import { authClient } from "@/lib/auth-client";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: jest.fn(),
    },
  },
}));

describe("SignInView", () => {
  const signInEmailMock = authClient.signIn.email as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  

  test("envía las credenciales válidas y redirige al dashboard", async () => {
    signInEmailMock.mockImplementation((_params, callbacks) => callbacks.onSuccess());

    render(<SignInView />);

    fireEvent.change(screen.getByLabelText("Correo institucional"), {
      target: { value: "usuario@alumno.ipn.mx" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledWith(
        {
          email: "usuario@alumno.ipn.mx",
          password: "12345678",
          callbackURL: "/",
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    expect(pushMock).toHaveBeenCalledWith("/");
  });

  test("muestra el error traducido para credenciales inválidas", async () => {
    signInEmailMock.mockImplementation((_params, callbacks) => {
      callbacks.onError({ error: { message: "Invalid email or password" } });
    });

    render(<SignInView />);

    fireEvent.change(screen.getByLabelText("Correo institucional"), {
      target: { value: "usuario@alumno.ipn.mx" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "passwordIncorrecta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => {
      expect(screen.getByText("Correo o contraseña incorrectos")).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  test("redirige a verificación cuando el correo no está verificado", async () => {
    signInEmailMock.mockImplementation((_params, callbacks) => {
      callbacks.onError({ error: { message: "Email not verified" } });
    });

    render(<SignInView />);

    fireEvent.change(screen.getByLabelText("Correo institucional"), {
      target: { value: "usuario@alumno.ipn.mx" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/verify-email?email=usuario%40alumno.ipn.mx"
      );
    });
  });
});
