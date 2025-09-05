/**
 * @jest-environment jsdom
 */

import { screen, waitFor } from "@testing-library/dom"
import userEvent from "@testing-library/user-event"
import Bills from "../containers/Bills.js"
import BillsUI from "../views/BillsUI.js"
import { ROUTES, ROUTES_PATH } from "../constants/routes.js"
import { localStorageMock } from "../__mocks__/localStorage.js"
import { bills as billsFixture } from "../fixtures/bills.js"
import router from "../app/Router.js";
import mockStore from "../__mocks__/store";

jest.mock("../app/Store.js", () => ({
  __esModule: true,
  default: require("../__mocks__/store").default,
}));

describe("Given I am connected as an employee", () => {
  beforeAll(() => {
    // Ensure jQuery + Bootstrap modal stub exist in jsdom
    if (!global.$) {
      const jQuery = require("jquery")
      global.$ = global.jQuery = jQuery
    }
    $.fn.modal = jest.fn()
  })

  beforeEach(() => {
    document.body.innerHTML = `<div id="root"></div>`
    Object.defineProperty(window, "localStorage", { value: localStorageMock })
    window.localStorage.setItem("user", JSON.stringify({ type: "Employee" }))
    window.onNavigate = (pathname) => {
      document.getElementById("root").innerHTML = ROUTES({ pathname })
    }
  })

  describe("When I am on Bills Page", () => {
    test('Then clicking "Nouvelle note de frais" should navigate to NewBill', async () => {
      // Given the Bills UI is rendered
      document.getElementById("root").innerHTML = BillsUI({ data: billsFixture })
      const onNavigate = jest.fn()

      // And the container is initialized (wires the button listener)
      new Bills({ document, onNavigate, store: null, localStorage: window.localStorage })

      // When I click the New Bill button
      const btn = screen.getByTestId("btn-new-bill")
      await userEvent.click(btn)

      // Then I should be navigated to the NewBill route
      expect(onNavigate).toHaveBeenCalledWith(ROUTES_PATH.NewBill)
    })

    test("Then clicking on an eye icon should open the proof modal with the image", async () => {
      // Given the Bills UI with actions (eyes) is rendered
      document.getElementById("root").innerHTML = BillsUI({ data: billsFixture })
      const onNavigate = jest.fn()
      new Bills({ document, onNavigate, store: null, localStorage: window.localStorage })

      // When I click the first eye icon
      const eye = document.querySelector('div[data-testid="icon-eye"]')
      expect(eye).toBeTruthy()
      await userEvent.click(eye)

      // Then the modal should open and contain an <img alt="Bill">
      const modalBody = document.querySelector("#modaleFile .modal-body")
      expect(modalBody.innerHTML).toMatch(/<img .*alt="Bill"/)
      expect($.fn.modal).toHaveBeenCalledWith("show")
    })
  })

  describe("When I request bills from the store", () => {
    test("Then it should return formatted bills on success", async () => {
      // Given a store that returns a valid bill list
      const mockList = jest.fn().mockResolvedValue([
        { id: "ok1", date: "2004-04-04", status: "pending", amount: 100, name: "A" },
      ])
      const store = { bills: () => ({ list: mockList }) }
      const container = new Bills({ document, onNavigate: jest.fn(), store, localStorage: window.localStorage })

      // When getBills is called
      const result = await container.getBills()

      // Then dates/status are formatted and a list is returned
      expect(mockList).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].date).not.toBe("2004-04-04") // formatted
      expect(result[0].status).toBeTruthy()         // formatted label
    })

    test("Then it should keep raw date if formatting throws (corrupted data)", async () => {
      // Given a store that returns a corrupted date
      const mockList = jest.fn().mockResolvedValue([
        { id: "bad1", date: "not-a-date", status: "refused", amount: 50, name: "B" },
      ])
      const store = { bills: () => ({ list: mockList }) }
      const container = new Bills({ document, onNavigate: jest.fn(), store, localStorage: window.localStorage })

      // When getBills is called
      const result = await container.getBills()

      // Then the fallback keeps the raw date and still formats status
      expect(result).toHaveLength(1)
      expect(result[0].date).toBe("not-a-date")
      expect(result[0].status).toBeTruthy()
    })

    test("Then it should return undefined if store is missing", () => {
      // Given there is no store
      const container = new Bills({ document, onNavigate: jest.fn(), store: null, localStorage: window.localStorage })

      // When getBills is called
      const result = container.getBills()

      // Then nothing is returned
      expect(result).toBeUndefined()
    })
  })
})

describe("Given I am a user connected as Employee", () => {
  describe("When I navigate to Bills", () => {
    test("Then it fetches bills from mock API GET and renders the table", async () => {
      // Given
      Object.defineProperty(window, "localStorage", { value: localStorageMock })
      window.localStorage.setItem("user", JSON.stringify({ type: "Employee", email: "a@a" }))
      const root = document.createElement("div")
      root.setAttribute("id", "root")
      document.body.append(root)
      router()

      // When
      window.onNavigate(ROUTES_PATH.Bills)

      // Then
      await waitFor(() => screen.getByText("Mes notes de frais"))

      // icône Bills surlignée
      const windowIcon = screen.getByTestId("icon-window")
      expect(windowIcon.classList.contains("active-icon")).toBe(true)

      // lignes récupérées depuis l'API mockée
      const rows = document.querySelectorAll("tbody tr")
      expect(rows.length).toBeGreaterThan(0)

      // actions (œil) présentes pour chaque ligne
      const eyes = document.querySelectorAll('[data-testid="icon-eye"]')
      expect(eyes.length).toBe(rows.length)
    })
  })

  describe("When an error occurs on API", () => {
    beforeEach(() => {
      jest.spyOn(mockStore, "bills")
      Object.defineProperty(window, "localStorage", { value: localStorageMock })
      window.localStorage.setItem("user", JSON.stringify({ type: "Employee", email: "a@a" }))
      const root = document.createElement("div")
      root.setAttribute("id", "root")
      document.body.append(root)
      router()
    })

    test("Then it fails with 404 message error", async () => {
      mockStore.bills.mockImplementationOnce(() => ({
        list: () => Promise.reject(new Error("Erreur 404")),
      }))

      window.onNavigate(ROUTES_PATH.Bills)
      await new Promise(process.nextTick)

      const message = await screen.getByText(/Erreur 404/)
      expect(message).toBeTruthy()
    })

    test("Then it fails with 500 message error", async () => {
      mockStore.bills.mockImplementationOnce(() => ({
        list: () => Promise.reject(new Error("Erreur 500")),
      }))

      window.onNavigate(ROUTES_PATH.Bills)
      await new Promise(process.nextTick)

      const message = await screen.getByText(/Erreur 500/)
      expect(message).toBeTruthy()
    })
  })
})

