import { describe, expect, it } from "vitest";
import { filterKuppiResources } from "./resourceFiltering";

const resources = [
  {
    title: "Functions revision map",
    description: "A guide for domain and range",
    subject: "Combined Maths",
    author: "Navodya Perera",
    stream: "Physical Science",
    level: "A/L",
  },
  {
    title: "Databases past-paper approach",
    description: "A guide for tables and keys",
    subject: "ICT",
    author: "Kavindu Dias",
    stream: "Technology",
    level: "O/L",
  },
];

describe("filterKuppiResources", () => {
  it("matches a student search across note details and contributor names", () => {
    expect(filterKuppiResources(resources, "Navodya", "All resources", "For you")).toEqual([resources[0]]);
    expect(filterKuppiResources(resources, "keys", "All resources", "For you")).toEqual([resources[1]]);
  });

  it("combines subject and level filters for relevant discovery", () => {
    expect(filterKuppiResources(resources, "", "A/L", "Combined Maths")).toEqual([resources[0]]);
    expect(filterKuppiResources(resources, "", "A/L", "ICT")).toEqual([]);
  });
});
