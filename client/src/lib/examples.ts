/**
 * Starter patterns shown in the Help → Examples dialog. Loading one creates a
 * project so users can learn by reading and editing real code.
 */
export interface Example {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'first-beat',
    name: 'First beat',
    description: 'A minimal four-on-the-floor drum loop.',
    code: '$: s("bd ~ bd ~").gain(0.8)\n$: s("~ ~ hh ~")',
  },
  {
    id: 'drums-melody',
    name: 'Drums + melody',
    description: 'A drum groove with a sawtooth melody and filter.',
    code: [
      '$: s("bd*2 ~ sd ~").room(0.2)',
      '$: note("c3 e3 g3 b3").s("sawtooth").lpf(800).gain(0.3)',
    ].join('\n'),
  },
  {
    id: 'effects',
    name: 'Effects playground',
    description: 'One pattern run through filter, delay and reverb.',
    code: 's("bd*4").lpf(sine.range(200,2000)).delay(0.3).room(0.5)',
  },
  {
    id: 'bassline',
    name: 'Bassline',
    description: 'A rolling bassline with a triangle wave.',
    code: 'note("c2 ~ c2 g1").s("triangle").lpf(500).gain(0.5)',
  },
  {
    id: 'live-set',
    name: 'Live set starter',
    description: 'Two sections and a setcps to begin a live performance.',
    code: [
      'setcps(0.5)',
      '$: s("bd ~ sd ~").room(0.2)',
      '$: note("<c3 e3 g3>").s("sawtooth").gain(0.25)',
    ].join('\n'),
  },
];
