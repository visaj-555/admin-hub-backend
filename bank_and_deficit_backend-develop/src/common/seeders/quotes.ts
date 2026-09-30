import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient } from 'generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function seedQuotes() {
  const quotes = [
    'Small acts of goodness create the biggest waves of change.',
    'One positive action today can brighten someone’s entire tomorrow.',
    'Consistency in kindness is more powerful than occasional greatness.',
    'Goodness grows quietly, but its impact echoes loudly.',
    'The world changes when ordinary people choose compassion daily.',
    'Every positive act is a deposit into humanity’s future.',
    'A kind heart leaves footprints long after words fade.',
    'Growth begins the moment goodness becomes a habit.',
    'Your smallest effort may become someone else’s biggest hope.',
    'True wealth is measured by the lives you uplift.',
    'Positivity multiplies when shared with others.',
    'Every day is another opportunity to leave the world softer than you found it.',
    'Good intentions become meaningful only through action.',
    'One thoughtful act can rewrite the mood of an entire day.',
    'Kindness is the only investment that never loses value.',
    'A consistent heart creates an unstoppable momentum.',
    'The best way to grow is to help others grow too.',
    'Goodness is contagious—spread it generously.',
    'Small daily efforts build extraordinary lives.',
    'Compassion is strength in its purest form.',
    'Your positive actions silently inspire people around you.',
    'The habit of doing good transforms both giver and receiver.',
    'Every sunrise is a reminder to begin again with kindness.',
    'Real success is measured by the good you leave behind.',
    'Moments of kindness become memories of hope.',
    'A single act of care can outshine a thousand words.',
    'Positivity starts with one intentional action.',
    'Helping others is the fastest way to enrich your own soul.',
    'The energy you give to the world always finds its way back.',
    'Goodness is built one mindful action at a time.',
    'Your daily actions shape the legacy you leave behind.',
    'True progress begins with becoming better than yesterday.',
    'The strongest communities are built on small acts of care.',
    'Every good deed adds light to the world.',
    'The economy of the soul thrives on kindness, gratitude, and consistency.',
  ];

  const existingQuotes = await prisma.quote.count();

  if (existingQuotes > 0) {
    console.log('ℹ️ Quotes already seeded');
    return;
  }

  await prisma.quote.createMany({
    data: quotes.map((content) => ({
      content,
    })),
  });

  console.log(`✅ ${quotes.length} quotes seeded`);
}

seedQuotes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
