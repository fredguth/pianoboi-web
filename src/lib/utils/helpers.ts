export const capitalize = (str: string): string => {
	if (!str) return '';
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const diatonicScale = [2, 2, 1, 2, 2, 2, 1];

export const centerPiano = ({
	selector,
	totalWidth,
	currentPosition
}: {
	selector: string;
	totalWidth: number;
	currentPosition: number;
}): void => {
	const piano = document.querySelector(selector) as HTMLElement;
	if (piano) {
		piano.scrollLeft = (currentPosition * piano.scrollWidth) / totalWidth - piano.clientWidth / 2;
	}
};

export const keyMarkup = (keyNumber: number, modifier: string = ''): string => {
	return `<div class="key ${modifier}" data-keyno="${keyNumber}"></div>`;
};

export const buildKeyboard = (
	keysContainer: HTMLElement,
	octaveCount = 7,
	initialKey = 24 // Start from C1
): void => {
	// Clear any existing keys
	keysContainer.innerHTML = '';

	let currentKey = initialKey;

	for (let i = 0; i < octaveCount; i++) {
		diatonicScale.forEach((diatonicStep) => {
			if (diatonicStep === 2) {
				// White key followed by black key
				keysContainer.innerHTML += keyMarkup(currentKey);
				currentKey++;
				keysContainer.innerHTML += keyMarkup(currentKey, 'black');
				currentKey++;
			} else {
				// Just a white key
				keysContainer.innerHTML += keyMarkup(currentKey);
				currentKey++;
			}
		});
	}
};

// Helper function to check if two arrays of chords are equal
export const chordsEqual = (a: string[], b: string[]): boolean => {
	if (a === b) return true;
	if (a == null || b == null) return false;
	if (a.length !== b.length) return false;

	const sortedA = [...a].sort();
	const sortedB = [...b].sort();

	for (let i = 0; i < sortedA.length; ++i) {
		if (sortedA[i] !== sortedB[i]) return false;
	}
	return true;
};

// Format number of flats/sharps in a key signature
export const renderAccidentalText = (signature: { sharps: number; flats: number }): string => {
	if (signature.sharps > 0) {
		return `(${signature.sharps} sharp${signature.sharps > 1 ? 's' : ''})`;
	} else if (signature.flats > 0) {
		return `(${signature.flats} flat${signature.flats > 1 ? 's' : ''})`;
	}
	return '';
};

// Get color for a note based on its position in the octave
export const getNoteColor = (noteName: string): string => {
	const colorMap: Record<string, string> = {
		C: 'bg-red-500',
		'C#': 'bg-red-600',
		D: 'bg-orange-500',
		'D#': 'bg-orange-600',
		E: 'bg-yellow-500',
		F: 'bg-green-500',
		'F#': 'bg-green-600',
		G: 'bg-blue-500',
		'G#': 'bg-blue-600',
		A: 'bg-indigo-500',
		'A#': 'bg-indigo-600',
		B: 'bg-purple-500'
	};

	return colorMap[noteName] || 'bg-gray-500';
};

// Format notes for display or processing
export interface NoteInfo {
	name: string;
	accidental?: string;
	octave: number;
}

export const formatNotes = (notes: NoteInfo[]): string[] => {
	return notes.map((note) => `${note.name}${note.accidental || ''}${note.octave}`);
};

// Get the octave of a note from its MIDI number
export const getNoteOctave = (midiNumber: number): number => {
	return Math.floor(midiNumber / 12) - 1;
};
