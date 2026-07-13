import { describe, expect, it } from "vitest";
import { parseVoiceTransaction } from "./voice";

const categories = ["Personal", "Transport"];
const subcategories = ["Comida", "Gasolina"];

describe("parseVoiceTransaction", () => {
  it("parses the ordered Spanish voice format", () => {
    expect(parseVoiceTransaction("Gasto personal comida hamburguesa treintamil", categories, subcategories)).toMatchObject({
      gastoIngresoAhorro: "Gasto",
      categoria: "Personal",
      subcategoria: "Comida",
      descripcion: "Hamburguesa",
      monto: 30000,
    });
  });

  it("accepts spaced and numeric thousand amounts", () => {
    expect(parseVoiceTransaction("Ingreso personal comida venta 30 mil", categories, subcategories)).toMatchObject({ monto: 30000 });
    expect(parseVoiceTransaction("Ingreso personal comida venta 30,000", categories, subcategories)).toMatchObject({ monto: 30000 });
    expect(parseVoiceTransaction("Gasto transport gasolina tanque ciento veinte mil", categories, subcategories)).toMatchObject({ monto: 120000 });
  });

  it("keeps unfamiliar spoken category labels for review", () => {
    expect(parseVoiceTransaction("Gasto TC personal hamburguesa 30,000", categories, subcategories)).toMatchObject({
      categoria: "TC", subcategoria: "personal", descripcion: "Hamburguesa", monto: 30000,
    });
  });

  it("requires the expected ordered fields", () => {
    expect(parseVoiceTransaction("personal comida hamburguesa treinta mil", categories, subcategories)).toEqual({ error: "Start with Gasto or Ingreso." });
    expect(parseVoiceTransaction("Gasto personal comida hamburguesa", categories, subcategories)).toEqual({ error: "Say an amount last, for example treinta mil." });
  });
});
