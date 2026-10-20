import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignUpView } from "./sign-up-view";
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
    signUp: {
      email: jest.fn(),
    },
  },
}));

describe("SignUpView", () => {
  const signUpEmailMock = authClient.signUp.email as jest.Mock;
  

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("valida que el correo institucional sea obligatorio y correcto", async () => {
      render(<SignUpView />);

      fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Ana García" },
    });
  
      fireEvent.change(screen.getByLabelText("Correo institucional"), {
        target: { value: "usuario@gmail.com" },
      });
      fireEvent.change(screen.getByLabelText("Contraseña"), {
        target: { value: "12345678" },
      });

      fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "12345678" },
    });

      fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
  
      await waitFor(() => {
        expect(
          screen.getByText("Solo se permiten correos institucionales @alumno.ipn.mx")
        ).toBeInTheDocument();
      });
  
      expect(signUpEmailMock).not.toHaveBeenCalled();
    });

  test("valida que la contraseña y la confirmación coincidan", async () => {
    render(<SignUpView />);

    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Ana García" },
    });
    fireEvent.change(screen.getByLabelText("Correo institucional"), {
      target: { value: "ana@alumno.ipn.mx" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "87654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => {
      expect(screen.getByText("Las contraseñas no coinciden")).toBeInTheDocument();
    });

    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  test("registra la cuenta correctamente y redirige a verificación", async () => {
    signUpEmailMock.mockImplementation((_params, callbacks) => callbacks.onSuccess());

    render(<SignUpView />);

    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Ana García" },
    });
    fireEvent.change(screen.getByLabelText("Correo institucional"), {
      target: { value: "ana@alumno.ipn.mx" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => {
      expect(signUpEmailMock).toHaveBeenCalledWith(
        {
          name: "Ana García",
          email: "ana@alumno.ipn.mx",
          password: "12345678",
          callbackURL: "/",
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    expect(pushMock).toHaveBeenCalledWith("/verify-email?email=ana%40alumno.ipn.mx");
  });

  test("muestra un mensaje de correo ya registrado con enlace a iniciar sesión", async () => {
    signUpEmailMock.mockImplementation((_params, callbacks) => {
      callbacks.onError({ error: { message: "User already exists" } });
    });

    render(<SignUpView />);

    fireEvent.change(screen.getByLabelText("Nombre completo"), {
      target: { value: "Ana García" },
    });
    fireEvent.change(screen.getByLabelText("Correo institucional"), {
      target: { value: "ana@alumno.ipn.mx" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => {
      expect(
        screen.getByText("Este correo ya está registrado. ¿Quieres iniciar sesión?")
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Inicia sesión aquí" })).toHaveAttribute(
      "href",
      "/sign-in"
    );
  });
});
