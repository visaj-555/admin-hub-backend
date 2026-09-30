import { PrismaPg } from '@prisma/adapter-pg';
import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';
import metadata from 'libphonenumber-js/metadata.full.json';
import { allCountries } from 'country-telephone-data';
import 'dotenv/config';
import { PrismaClient } from 'generated/prisma/client';

countries.registerLocale(en);

/** `country-telephone-data` has no stable typings; narrow for safe use. */
type CountryTelephoneRow = { iso2: string; dialCode: string };

const allCountriesTyped = allCountries as CountryTelephoneRow[];

/** libphonenumber metadata JSON is loosely typed at import; narrow per field we read. */
type MetadataCountries = Record<string, readonly unknown[] | undefined>;

const metadataTyped = metadata as { countries: MetadataCountries };

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function getPhoneCode(iso2: string): string {
  const match = allCountriesTyped.find(
    (c) => c.iso2.toUpperCase() === iso2.toUpperCase(),
  );
  return match ? `+${match.dialCode}` : '';
}

function getPhoneLengthRange(iso2: string): { min: number; max: number } {
  try {
    const countryMeta = metadataTyped.countries[iso2];

    if (!countryMeta) return { min: 6, max: 15 };

    const lengthsRaw = countryMeta[3];
    const lengths = Array.isArray(lengthsRaw)
      ? lengthsRaw.map((n) => Number(n))
      : [];

    if (lengths.length === 0) {
      return { min: 6, max: 15 };
    }

    return {
      min: Math.min(...lengths),
      max: Math.max(...lengths),
    };
  } catch {
    return { min: 6, max: 15 };
  }
}

async function seedCountries() {
  const countryNames = countries.getNames('en', { select: 'official' });

  for (const iso2 of Object.keys(countryNames)) {
    const name = countryNames[iso2];
    const iso3 = countries.alpha2ToAlpha3(iso2);
    const phoneCode = getPhoneCode(iso2);
    const { min, max } = getPhoneLengthRange(iso2);

    if (!iso3 || !phoneCode) continue;

    await prisma.country.upsert({
      where: { iso2 },
      update: {},
      create: {
        name,
        iso2,
        iso3,
        phoneCode,
        minLength: min,
        maxLength: max,
      },
    });
  }

  console.log('✅ Countries with phone validation seeded');
}

async function main() {
  await seedCountries();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
