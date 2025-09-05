/**
 * @jest-environment jsdom
 */

import { screen, waitFor, fireEvent } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";

import NewBillUI from "../views/NewBillUI.js";
import NewBill from "../containers/NewBill.js";
import router from "../app/Router.js";
import mockStore from "../__mocks__/store";
import { bills as billsFixture } from "../fixtures/bills.js";
import { localStorageMock } from "../__mocks__/localStorage.js";
import { ROUTES_PATH } from "../constants/routes.js";

// ✅ Mock ESM par défaut, sans dépendre d'une variable hoistée
jest.mock("../app/Store.js", () => ({
  __esModule: true,
  default: require("../__mocks__/store").default,
}));

// Helpers
const render = () => {
  document.body.innerHTML = NewBillUI();
};

const setupEmployee = () => {
  Object.defineProperty(window, "localStorage", { value: localStorageMock });
  window.localStorage.setItem(
    "user",
    JSON.stringify({ type: "Employee", email: "a@a" })
  );
  Object.defineProperty(global, "localStorage", { value: window.localStorage });
};

describe("Given I am connected as an employee", () => {
  beforeEach(() => {
    setupEmployee();
    render();
  });

  describe("When I am on NewBill Page", () => {
    test("Then the form should render with its main fields", () => {
      expect(screen.getByTestId("form-new-bill")).toBeTruthy();
      expect(screen.getByTestId("expense-type")).toBeTruthy();
      expect(screen.getByTestId("expense-name")).toBeTruthy();
      expect(screen.getByTestId("amount")).toBeTruthy();
      expect(screen.getByTestId("datepicker")).toBeTruthy();
      expect(screen.getByTestId("vat")).toBeTruthy();
      expect(screen.getByTestId("pct")).toBeTruthy();
      expect(screen.getByTestId("commentary")).toBeTruthy();
      expect(screen.getByTestId("file")).toBeTruthy();
    });

    test("Then uploading a VALID image file should call store.create and set fileUrl/billId (fileName is a string)", async () => {
      // Given a store mock that resolves create()
      const create = jest
        .fn()
        .mockResolvedValue({ fileUrl: "https://cdn/test.png", key: "abc123" });
      const store = { bills: () => ({ create, update: jest.fn() }) };

      const onNavigate = jest.fn();
      const container = new NewBill({
        document,
        onNavigate,
        store,
        localStorage: window.localStorage,
      });

      const fileInput = screen.getByTestId("file");
      const file = new File(["dummy"], "note.png", { type: "image/png" });

      // When
      await userEvent.upload(fileInput, file);

      // Then
      expect(create).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(container.fileUrl).toBe("https://cdn/test.png");
        expect(container.billId).toBe("abc123");
        // jsdom fournit souvent e.target.value === "", donc fileName peut être "".
        // On vérifie que c'est bien une chaîne (vide ou non).
        expect(typeof container.fileName).toBe("string");
      });
    });

    test("Then uploading an INVALID file should alert and NOT call store.create", async () => {
      const create = jest.fn();
      const store = { bills: () => ({ create, update: jest.fn() }) };
      const onNavigate = jest.fn();
      const container = new NewBill({
        document,
        onNavigate,
        store,
        localStorage: window.localStorage,
      });

      const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
      const fileInput = screen.getByTestId("file");
      const badFile = new File(["dummy"], "doc.pdf", {
        type: "application/pdf",
      });

      // When
      await userEvent.upload(fileInput, badFile);

      // Then
      expect(alertSpy).toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(container.fileUrl).toBeNull();
      expect(container.fileName).toBeNull();

      alertSpy.mockRestore();
    });

    test("Then submitting a filled form should call updateBill and navigate to Bills", async () => {
      // Given
      const update = jest.fn().mockResolvedValue({});
      const store = { bills: () => ({ create: jest.fn(), update }) };
      const onNavigate = jest.fn();
      const container = new NewBill({
        document,
        onNavigate,
        store,
        localStorage: window.localStorage,
      });

      // Simuler un upload déjà fait (fileUrl/fileName/billId définis)
      container.fileUrl = "https://cdn/test.png";
      container.fileName = "note.png";
      container.billId = "abc123";

      // Remplir les champs
      screen.getByTestId("expense-type").value = "Transports";
      screen.getByTestId("expense-name").value = "Taxi";
      screen.getByTestId("amount").value = "42";
      screen.getByTestId("datepicker").value = "2023-01-02";
      screen.getByTestId("vat").value = "20";
      screen.getByTestId("pct").value = "10";
      screen.getByTestId("commentary").value = "Trajet client";

      // When
      const form = screen.getByTestId("form-new-bill");
      fireEvent.submit(form);

      // Then: onNavigate est appelé (immédiat)
      await waitFor(() =>
        expect(onNavigate).toHaveBeenCalledWith(ROUTES_PATH.Bills)
      );

      // Et update() est appelé via updateBill()
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const sent = JSON.parse(update.mock.calls[0][0].data);
      expect(sent).toMatchObject({
        type: "Transports",
        name: "Taxi",
        amount: 42,
        date: "2023-01-02",
        vat: "20",
        pct: 10,
        commentary: "Trajet client",
        fileUrl: "https://cdn/test.png",
        fileName: "note.png",
        status: "pending",
      })
    });

    test("Then submitting with NO store should still navigate to Bills without throwing", async () => {
      const onNavigate = jest.fn();
      new NewBill({
        document,
        onNavigate,
        store: null,
        localStorage: window.localStorage,
      });

      // Champs minimaux
      screen.getByTestId("expense-type").value = "Restaurants";
      screen.getByTestId("expense-name").value = "Déj";
      screen.getByTestId("amount").value = "15";
      screen.getByTestId("datepicker").value = "2024-05-06";
      screen.getByTestId("vat").value = "10";
      screen.getByTestId("pct").value = "20";
      screen.getByTestId("commentary").value = "Menu du jour";

      const form = screen.getByTestId("form-new-bill");
      fireEvent.submit(form);

      // Then
      await waitFor(() =>
        expect(onNavigate).toHaveBeenCalledWith(ROUTES_PATH.Bills)
      );
    });
  });
});

test("Then it POSTs the bill (create+update) and navigates to Bills", async () => {
  // reset DOM to avoid duplicate forms from previous tests
  document.body.innerHTML = "";

  // Arrange: localStorage + root + router
  Object.defineProperty(window, "localStorage", { value: localStorageMock })
  window.localStorage.setItem("user", JSON.stringify({ type: "Employee", email: "a@a" }))
  Object.defineProperty(global, "localStorage", { value: window.localStorage }) // cohérent avec le container

  const root = document.createElement("div")
  root.setAttribute("id", "root")
  document.body.append(root)
  router()

  // Espions/Mocks pour Store
  const createMock = jest.fn().mockResolvedValue({ fileUrl: "https://cdn/test.png", key: "123" })
  const updateMock = jest.fn().mockResolvedValue({})
  const listMock   = jest.fn().mockResolvedValue(billsFixture) // utilisé par la page Bills après navigation

  const billsSpy = jest.spyOn(mockStore, "bills").mockImplementation(() => ({
    create: createMock,
    update: updateMock,
    list:   listMock,
  }))

  // Act: on va sur NewBill
  window.onNavigate(ROUTES_PATH.NewBill)

  // le formulaire doit être là (si jamais il y en a deux, on prend le premier)
  const forms = await screen.findAllByTestId("form-new-bill")
  const form = forms[0]

  // Upload fichier valide (déclenche bills().create)
  const fileInput = screen.getByTestId("file")
  const file = new File(["dummy"], "note.png", { type: "image/png" })
  await userEvent.upload(fileInput, file)

  // Renseigner les champs
  screen.getByTestId("expense-type").value = "Transports"
  screen.getByTestId("expense-name").value = "Taxi"
  screen.getByTestId("amount").value = "42"
  screen.getByTestId("datepicker").value = "2023-01-02"
  screen.getByTestId("vat").value = "20"
  screen.getByTestId("pct").value = "10"
  screen.getByTestId("commentary").value = "Trajet client"

  // Submit (déclenche update + navigation vers Bills)
  fireEvent.submit(form)

  // Assert: navigation vers Bills (UI)
  await waitFor(() => expect(screen.getByText("Mes notes de frais")).toBeTruthy())

  // create() a bien été appelé pour l’upload
  expect(createMock).toHaveBeenCalledTimes(1)
  // update() a bien été appelé avec le bill + selector = "123"
  expect(updateMock).toHaveBeenCalledTimes(1)
  const updateArg = updateMock.mock.calls[0][0]
  expect(updateArg.selector).toBe("123")

  const sent = JSON.parse(updateArg.data)
  expect(sent).toMatchObject({
    type: "Transports",
    name: "Taxi",
    amount: 42,
    date: "2023-01-02",
    vat: "20",
    pct: 10,
    commentary: "Trajet client",
    fileUrl: "https://cdn/test.png",
    status: "pending",
  })
  expect(typeof sent.fileName).toBe("string")

  // Après navigation, la page Bills appelle list()
  expect(listMock).toHaveBeenCalled()

  billsSpy.mockRestore()
})
