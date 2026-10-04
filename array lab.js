const products = [
  {
    id: "p1",
    title: "Механическая клавиатура",
    price: 8500,
    category: "accessories",
    inStock: true,
    rating: 4.8
  },
  {
    id: "p2",
    title: "Игровой монитор 144Hz",
    price: 24000,
    category: "displays",
    inStock: false,
    rating: 4.6
  },
  {
    id: "p3",
    title: "Беспроводная мышь",
    price: 4200,
    category: "accessories",
    inStock: true,
    rating: 4.9
  },
  {
    id: "p4",
    title: "USB-C Хаб 7-in-1",
    price: 3100,
    category: "adapters",
    inStock: true,
    rating: 4.2
  },
  {
    id: "p5",
    title: "Кронштейн для монитора",
    price: 5600,
    category: "accessories",
    inStock: false,
    rating: 4.7
  }
];

console.log(`Загружено товаров: ${products.length}`);

if (typeof module !== "undefined") {
  module.exports = { products };
}
