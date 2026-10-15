import type { CategoryGroupKind, Locale } from './enums.ts'

/**
 * Initial category taxonomy seeded into every new household, in its locale.
 * Derived from a real bank export (synthetic names only). Slugs are stable
 * identifiers: the importer's bank-category map and the system rules point
 * at them, so never rename one. Names are bilingual here and in the API's
 * `resources/lang/<locale>/categories.json` catalogs (a test keeps them in
 * sync). Transfers are not a category and "uncategorized" is NULL.
 */

export interface TaxonomyCategory {
  slug: string
  nameEn: string
  nameEs: string
}

export interface TaxonomyGroup {
  slug: string
  kind: CategoryGroupKind
  nameEn: string
  nameEs: string
  categories: readonly TaxonomyCategory[]
}

export const TAXONOMY: readonly TaxonomyGroup[] = [
  {
    slug: 'housing',
    kind: 'expense',
    nameEn: 'Housing',
    nameEs: 'Vivienda',
    categories: [
      { slug: 'rent', nameEn: 'Rent', nameEs: 'Renta' },
      { slug: 'utilities', nameEn: 'Utilities', nameEs: 'Servicios (luz, agua, gas)' },
      { slug: 'phone-internet', nameEn: 'Phone & internet', nameEs: 'Teléfono e internet' },
      { slug: 'home-goods', nameEn: 'Home & household', nameEs: 'Hogar y varios' },
    ],
  },
  {
    slug: 'food',
    kind: 'expense',
    nameEn: 'Food',
    nameEs: 'Alimentación',
    categories: [
      { slug: 'groceries', nameEn: 'Groceries', nameEs: 'Supermercado' },
      {
        slug: 'restaurants-takeaway',
        nameEn: 'Restaurants & takeaway',
        nameEs: 'Restaurantes y comida para llevar',
      },
      { slug: 'cafe-coffee', nameEn: 'Cafes & coffee', nameEs: 'Café' },
      { slug: 'alcohol', nameEn: 'Alcohol', nameEs: 'Alcohol' },
      { slug: 'snacks', nameEn: 'Snacks & vending', nameEs: 'Snacks y máquinas' },
    ],
  },
  {
    slug: 'transport',
    kind: 'expense',
    nameEn: 'Transport',
    nameEs: 'Transporte',
    categories: [
      { slug: 'public-transport', nameEn: 'Public transport', nameEs: 'Transporte público' },
      { slug: 'rideshare-taxi', nameEn: 'Rideshare & taxi', nameEs: 'Uber y taxi' },
    ],
  },
  {
    slug: 'health',
    kind: 'expense',
    nameEn: 'Health & wellbeing',
    nameEs: 'Salud y bienestar',
    categories: [
      { slug: 'gym', nameEn: 'Gym & fitness', nameEs: 'Gimnasio' },
      { slug: 'medical-pharmacy', nameEn: 'Medical & pharmacy', nameEs: 'Médico y farmacia' },
      { slug: 'personal-care', nameEn: 'Personal care', nameEs: 'Cuidado personal' },
    ],
  },
  {
    slug: 'shopping',
    kind: 'expense',
    nameEn: 'Shopping',
    nameEs: 'Compras',
    categories: [
      { slug: 'clothing', nameEn: 'Clothing', nameEs: 'Ropa' },
      { slug: 'electronics', nameEn: 'Electronics', nameEs: 'Electrónica' },
      { slug: 'gifts', nameEn: 'Gifts', nameEs: 'Regalos' },
    ],
  },
  {
    slug: 'leisure',
    kind: 'expense',
    nameEn: 'Leisure',
    nameEs: 'Ocio',
    categories: [
      {
        slug: 'entertainment-events',
        nameEn: 'Entertainment & events',
        nameEs: 'Entretenimiento y eventos',
      },
      {
        slug: 'subscriptions-games',
        nameEn: 'Subscriptions & games',
        nameEs: 'Suscripciones y juegos',
      },
      { slug: 'shared-outings', nameEn: 'Outings with friends', nameEs: 'Salidas con amigos' },
    ],
  },
  {
    slug: 'travel',
    kind: 'expense',
    nameEn: 'Travel',
    nameEs: 'Viajes',
    categories: [
      { slug: 'flights', nameEn: 'Flights', nameEs: 'Vuelos' },
      { slug: 'accommodation', nameEn: 'Accommodation', nameEs: 'Hospedaje' },
      { slug: 'travel-expenses', nameEn: 'Travel expenses', nameEs: 'Gastos de viaje' },
    ],
  },
  {
    slug: 'education',
    kind: 'expense',
    nameEn: 'Education',
    nameEs: 'Educación',
    categories: [
      { slug: 'university', nameEn: 'University', nameEs: 'Universidad' },
      { slug: 'books-courses', nameEn: 'Books & courses', nameEs: 'Libros y cursos' },
    ],
  },
  {
    slug: 'finance-other',
    kind: 'expense',
    nameEn: 'Finance & other',
    nameEs: 'Finanzas y otros',
    categories: [
      { slug: 'bank-fees', nameEn: 'Bank & service fees', nameEs: 'Comisiones' },
      { slug: 'taxes', nameEn: 'Taxes', nameEs: 'Impuestos' },
      { slug: 'donations', nameEn: 'Donations', nameEs: 'Donativos' },
      { slug: 'insurance', nameEn: 'Insurance', nameEs: 'Seguros' },
      { slug: 'remittances', nameEn: 'Money sent abroad', nameEs: 'Envíos de dinero' },
      { slug: 'misc', nameEn: 'Miscellaneous', nameEs: 'Otros' },
    ],
  },
  {
    slug: 'income',
    kind: 'income',
    nameEn: 'Income',
    nameEs: 'Ingresos',
    categories: [
      { slug: 'salary', nameEn: 'Salary', nameEs: 'Sueldo' },
      { slug: 'reimbursements', nameEn: 'Reimbursements', nameEs: 'Reembolsos de amigos' },
      { slug: 'refunds', nameEn: 'Refunds', nameEs: 'Devoluciones' },
      { slug: 'cash-income', nameEn: 'Cash income', nameEs: 'Ingreso en efectivo' },
      { slug: 'interest', nameEn: 'Interest', nameEs: 'Intereses' },
      { slug: 'other-income', nameEn: 'Other income', nameEs: 'Otros ingresos' },
    ],
  },
]

/** Name of a taxonomy group or category in the given locale. */
export function taxonomyName(entry: { nameEn: string; nameEs: string }, locale: Locale): string {
  return locale === 'es' ? entry.nameEs : entry.nameEn
}
