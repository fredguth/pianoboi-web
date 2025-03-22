export type KeyId = string;

export type Signature = {
	id: KeyId;
	major: string;
	minor: string;
	sharps: number;
	flats: number;
	label: string;
};

export type Accidental = '#' | 'b';

export const signatures: Signature[] = [
	{ id: 'C', major: 'C', minor: 'A', sharps: 0, flats: 0, label: 'C major / A minor' },
	{ id: 'G', major: 'G', minor: 'E', sharps: 1, flats: 0, label: 'G major / E minor (1 sharp)' },
	{ id: 'D', major: 'D', minor: 'B', sharps: 2, flats: 0, label: 'D major / B minor (2 sharps)' },
	{ id: 'A', major: 'A', minor: 'F#', sharps: 3, flats: 0, label: 'A major / F# minor (3 sharps)' },
	{ id: 'E', major: 'E', minor: 'C#', sharps: 4, flats: 0, label: 'E major / C# minor (4 sharps)' },
	{ id: 'B', major: 'B', minor: 'G#', sharps: 5, flats: 0, label: 'B major / G# minor (5 sharps)' },
	{
		id: 'F#',
		major: 'F#',
		minor: 'D#',
		sharps: 6,
		flats: 0,
		label: 'F# major / D# minor (6 sharps)'
	},
	{
		id: 'C#',
		major: 'C#',
		minor: 'A#',
		sharps: 7,
		flats: 0,
		label: 'C# major / A# minor (7 sharps)'
	},
	{ id: 'F', major: 'F', minor: 'D', sharps: 0, flats: 1, label: 'F major / D minor (1 flat)' },
	{ id: 'Bb', major: 'Bb', minor: 'G', sharps: 0, flats: 2, label: 'Bb major / G minor (2 flats)' },
	{ id: 'Eb', major: 'Eb', minor: 'C', sharps: 0, flats: 3, label: 'Eb major / C minor (3 flats)' },
	{ id: 'Ab', major: 'Ab', minor: 'F', sharps: 0, flats: 4, label: 'Ab major / F minor (4 flats)' },
	{
		id: 'Db',
		major: 'Db',
		minor: 'Bb',
		sharps: 0,
		flats: 5,
		label: 'Db major / Bb minor (5 flats)'
	},
	{
		id: 'Gb',
		major: 'Gb',
		minor: 'Eb',
		sharps: 0,
		flats: 6,
		label: 'Gb major / Eb minor (6 flats)'
	},
	{
		id: 'Cb',
		major: 'Cb',
		minor: 'Ab',
		sharps: 0,
		flats: 7,
		label: 'Cb major / Ab minor (7 flats)'
	}
];
