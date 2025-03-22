// Piano key definitions
// This file defines the keys for the piano keyboard

export interface PianoKey {
	note: string; // Note name (C, D, E, etc.)
	accidental: string; // Sharp (#) or flat (b) or empty string for naturals
	octave: number; // Octave number (1-7)
	position: number; // Position on the keyboard (for rendering)
}

// Generate piano keys across all octaves
function generateKeys(): PianoKey[] {
	const keys: PianoKey[] = [];
	const naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const sharps = ['C', 'D', 'F', 'G', 'A']; // Notes that have sharps

	let position = 0;

	// Generate keys for octaves 1-7
	for (let octave = 1; octave <= 7; octave++) {
		for (let i = 0; i < naturalNotes.length; i++) {
			const note = naturalNotes[i];

			// Add natural key
			keys.push({
				note,
				accidental: '',
				octave,
				position
			});

			position++;

			// Add sharp key if applicable
			if (sharps.includes(note)) {
				keys.push({
					note,
					accidental: '#',
					octave,
					position: position - 0.5 // Position between natural keys
				});
			}
		}
	}

	return keys;
}

// Pre-generate all piano keys
export const keys = generateKeys();
