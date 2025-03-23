<script lang="ts">
	import { browser } from '$app/environment';
	import type { Signature } from '$lib/types/signatures';
	import { signatures } from '$lib/types/signatures';
	import { onDestroy, onMount } from 'svelte';
	import type { Input, NoteMessageEvent } from 'webmidi';
	import { WebMidi } from 'webmidi';
	import Piano from './Piano.svelte';
	import SheetMusic from './SheetMusic.svelte';
	import ChordDisplay from './ChordDisplay.svelte';
	import { Chord } from '@tonaljs/tonal';

	// State
	let midiEnabled = false;
	let midiInputs: Input[] = [];
	let selectedInput: Input | null = null;
	let activeNotes: any[] = [];
	let currentSignature: Signature = signatures[0];
	let midiError = '';
	let isInitializing = false;
	let isMenuOpen = false;
	let isKeyMenuOpen = false;

	// View mode state
	let viewMode: 'keyboard' | 'sheet' = 'keyboard';

	// Chord Riffing - Save chord progressions
	interface SavedChord {
		id: string; // Unique identifier
		notes: any[]; // The notes in the chord
		signature: Signature; // Key signature at the time of save
		timestamp: number; // When it was saved
	}

	let savedChords: SavedChord[] = [];
	let chordsContainerElement: HTMLDivElement;
	let currentChordId: string | null = null; // Track where new chords will be inserted

	// Load saved chords from localStorage
	function loadSavedChords() {
		if (!browser) return;

		try {
			const savedData = localStorage.getItem('pianoboi-saved-chords');
			console.log('Loading from localStorage:', savedData);

			if (savedData) {
				// Need to reconstruct saved chords with proper Signature object references
				const parsed = JSON.parse(savedData);
				savedChords = parsed.map((chord: any) => {
					// Find the matching signature object by ID
					const matchedSignature =
						signatures.find((sig) => sig.id === chord.signature.id) || signatures[0];

					// Process notes to ensure they have proper format and signature
					const processedNotes = chord.notes.map((note: any) => {
						// Convert _name to name if needed (for MIDI notes)
						const processedNote =
							note._name && !note.name
								? {
										name: note._name,
										accidental: note._accidental || '',
										octave: note._octave,
										number: calculateNoteNumber(note._name, note._accidental || '', note._octave),
										identifier: `${note._name}${note._accidental || ''}${note._octave}`,
										attack: note._attack || 0.5,
										release: note._release || 0.5
									}
								: { ...note };

						// Ensure each note has the correct signature reference
						processedNote.signature = matchedSignature;
						return processedNote;
					});

					// Ensure all required fields are present
					return {
						...chord,
						notes: processedNotes,
						signature: matchedSignature,
						id: chord.id || `chord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
						timestamp: chord.timestamp || Date.now()
					};
				});
				console.log('Loaded saved chords:', savedChords);
			}
		} catch (error) {
			console.error('Error loading saved chords:', error);
			// Start fresh if there was an error
			savedChords = [];
		}
	}

	// Save chords to localStorage
	function persistSavedChords() {
		if (!browser) return;

		try {
			localStorage.setItem('pianoboi-saved-chords', JSON.stringify(savedChords));
			console.log('Saved chords to localStorage:', savedChords);
		} catch (error) {
			console.error('Error saving chords to localStorage:', error);
		}
	}

	// Function to save the current chord
	function saveCurrentChord() {
		console.log('Attempting to save chord:', activeNotes);
		// Don't save if no notes are active
		if (activeNotes.length === 0) {
			console.log('No notes to save');
			return;
		}

		const id = `chord-${Date.now()}`;
		
		// Process notes to ensure consistent format before saving
		const processedNotes = activeNotes.map((note) => {
			// Check if this is a WebMidi note (which has _name, _accidental properties)
			// or a manually created note (which has name, accidental properties)
			const processedNote = {
				name: note.name || note._name,
				accidental: note.accidental || note._accidental || '',
				octave: note.octave || note._octave,
				number: note.number || calculateNoteNumber(
					note.name || note._name, 
					note.accidental || note._accidental || '', 
					note.octave || note._octave
				),
				identifier: note.identifier || `${note.name || note._name}${note.accidental || note._accidental || ''}${note.octave || note._octave}`,
				attack: note.attack || note._attack || 0.5,
				release: note.release || note._release || 0.5,
				signature: currentSignature
			};
			
			console.log('Processed note for saving:', processedNote);
			return processedNote;
		});

		const newChord = {
			id,
			notes: processedNotes,
			signature: currentSignature,
			timestamp: Date.now()
		};

		console.log('Creating new chord:', newChord);

		// Simply create a new array reference for proper reactivity
		if (currentChordId === 'top') {
			savedChords = [newChord, ...savedChords];
		} else if (currentChordId) {
			const index = savedChords.findIndex((chord) => chord.id === currentChordId);
			if (index !== -1) {
				const updatedChords = [...savedChords];
				updatedChords.splice(index + 1, 0, newChord);
				savedChords = updatedChords;
			} else {
				savedChords = [...savedChords, newChord];
			}
		} else {
			// No insertion point set, add to end
			savedChords = [...savedChords, newChord];
		}

		// Debug log to check that the chord was added
		console.log('Saved chords now:', savedChords);

		// Set the current chord ID to the new chord's ID
		// so next insertion will be after this chord
		setCurrentChord(id);

		// Persist saved chords
		persistSavedChords();
	}

	// Function to set the current chord and update the insertion marker
	function setCurrentChord(id: string | null): void {
		currentChordId = id;
		
		// Use a small delay to ensure DOM is updated before scrolling
		setTimeout(() => {
			if (id) {
				// For insertion markers
				const markerId = id === 'top' ? 'insert-marker-top' : `insert-marker-${id}`;
				const marker = document.getElementById(markerId);
				if (marker) {
					console.log(`Scrolling to marker: ${markerId}`);
					marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
				
				// For the chord itself
				if (id !== 'top') {
					const chordElement = document.getElementById(id);
					if (chordElement) {
						console.log(`Scrolling to chord: ${id}`);
						chordElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
						// Add some visual feedback using Tailwind classes
						chordElement.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50');
						setTimeout(() => {
							chordElement.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50');
						}, 1500);
					}
				}
			}
		}, 50);
	}

	// Function to handle dropdown menu visibility
	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	// Function to handle key signature menu visibility
	function toggleKeyMenu() {
		isKeyMenuOpen = !isKeyMenuOpen;
	}

	// Delete a chord by ID
	function deleteChord(id: string) {
		// Create a new array reference for proper reactivity
		savedChords = savedChords.filter((chord) => chord.id !== id);
		persistSavedChords();

		if (currentChordId === id) {
			const chordIndex = savedChords.findIndex((chord) => chord.id === id);
			if (chordIndex > 0) {
				currentChordId = savedChords[chordIndex - 1].id;
			} else if (savedChords.length > 0) {
				currentChordId = 'top';
			} else {
				currentChordId = null;
			}
		}
	}

	// Listen for space key to save chord
	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'Space' && !event.repeat) {
			event.preventDefault(); // Prevent scrolling
			saveCurrentChord();
		}
	}

	onMount(() => {
		initializeWebMidi();
		loadSavedChords();
		if (browser) {
			window.addEventListener('keydown', handleKeyDown);
		}
	});

	onDestroy(() => {
		// Disable WebMidi (this cleans up all listeners)
		if (midiEnabled && WebMidi.enabled) {
			try {
				WebMidi.disable();
			} catch (e) {
				console.error('Error disabling WebMidi:', e);
			}
		}

		// Remove keyboard listener - only in browser environment
		if (browser) {
			window.removeEventListener('keydown', handleKeyDown);
		}
	});

	async function initializeWebMidi() {
		try {
			isInitializing = true;
			midiError = '';

			if (!WebMidi.enabled) {
				await WebMidi.enable();
			}

			midiEnabled = true;
			midiInputs = WebMidi.inputs;
			console.log('MIDI Inputs:', midiInputs);

			// Auto-select first input if available
			if (midiInputs.length > 0 && !selectedInput) {
				selectedInput = midiInputs[0];
				setupMidiListeners();
			}
		} catch (err: unknown) {
			console.error('WebMidi could not be enabled:', err);
			midiError = `Could not enable WebMidi: ${err instanceof Error ? err.message : String(err)}`;
			midiEnabled = false;
		} finally {
			isInitializing = false;
		}
	}

	function refreshMidiDevices() {
		if (selectedInput) {
			// Clean up before refreshing
			for (const input of midiInputs) {
				// WebMidi.js doesn't have hasListener with a callback check in some versions
				// Just try to remove listeners by type
				try {
					input.removeListener('noteon');
					input.removeListener('noteoff');
				} catch (e) {
					console.warn('Error removing listeners:', e);
				}
			}
			selectedInput = null;
			activeNotes = [];
		}

		initializeWebMidi();
	}

	function setupMidiListeners() {
		if (!selectedInput) return;

		// Clean up previous listeners
		try {
			selectedInput.removeListener('noteon');
			selectedInput.removeListener('noteoff');
		} catch (e) {
			console.warn('Error removing listeners:', e);
		}

		// Set up note listeners
		selectedInput.channels[1].addListener('noteon', handleNoteOn);
		selectedInput.channels[1].addListener('noteoff', handleNoteOff);

		console.log('MIDI listeners set up for', selectedInput.name);
	}

	function handleNoteOn(e: NoteMessageEvent) {
		console.log('Note ON:', e.note);
		
		// Create a standardized note object that's compatible with both MIDI and onscreen keyboard
		const note = {
			name: e.note.name,
			accidental: e.note.accidental || '',
			octave: e.note.octave,
			number: e.note.number,
			identifier: `${e.note.name}${e.note.accidental || ''}${e.note.octave}`,
			attack: e.note.attack || 0.5,
			release: e.note.release || 0.5
		};
		
		console.log('Standardized MIDI note:', note);
		activeNotes = [...activeNotes, note];
	}

	function handleNoteOff(e: NoteMessageEvent) {
		console.log('Note OFF:', e.note);
		// Filter using the note number and octave which are the most reliable identifiers
		activeNotes = activeNotes.filter(
			(note) => !(note.number === e.note.number && note.octave === e.note.octave)
		);
	}

	function handleInputChange() {
		if (selectedInput) {
			setupMidiListeners();
			console.log('MIDI input changed to:', selectedInput.name);
			// Close menu after selection
			isMenuOpen = false;
		}
	}

	// Handle piano key presses coming from the Piano component
	function handlePianoNotePress(event: {
		detail: { name: string; accidental: string; octave: number; isOn: boolean };
	}) {
		const noteData = event.detail;
		console.log('Piano key event:', noteData);

		if (noteData.isOn) {
			// Simulate note-on
			// Create a WebMidi compatible note object
			const note = {
				name: noteData.name.toUpperCase(), // WebMidi uses uppercase notes
				accidental: noteData.accidental,
				octave: noteData.octave,
				// Calculate MIDI note number (middle C = 60)
				number: calculateNoteNumber(noteData.name, noteData.accidental, noteData.octave),
				// Additional properties that might be needed
				identifier: `${noteData.name}${noteData.accidental}${noteData.octave}`,
				attack: 0.5,
				release: 0.5
			};

			console.log('Created WebMidi note object:', note);
			activeNotes = [...activeNotes, note];
		} else {
			// Simulate note-off
			activeNotes = activeNotes.filter(
				(note) =>
					!(
						note.name === noteData.name.toUpperCase() &&
						note.accidental === noteData.accidental &&
						note.octave === noteData.octave
					)
			);
		}
	}

	// Calculate MIDI note number from note name, accidental and octave
	function calculateNoteNumber(name: string, accidental: string, octave: number): number {
		// Base notes C to B in semitones from C
		const baseNotes: { [key: string]: number } = {
			C: 0,
			D: 2,
			E: 4,
			F: 5,
			G: 7,
			A: 9,
			B: 11
		};

		// Calculate semitones from middle C (C4 = 60)
		const noteSemitones = baseNotes[name.toUpperCase()];
		const accidentalOffset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
		const octaveOffset = (octave - 4) * 12; // C4 is MIDI 60

		return 60 + octaveOffset + noteSemitones + accidentalOffset;
	}

	// Toggle view mode
	function toggleViewMode(mode: 'keyboard' | 'sheet') {
		viewMode = mode;
	}

	// Generate the scale degree chords for a given key
	function generateScaleChords(signature: Signature) {
		const majorScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
		const noteValues: { [key: string]: number } = {
			C: 0,
			'C#': 1,
			Db: 1,
			D: 2,
			'D#': 3,
			Eb: 3,
			E: 4,
			F: 5,
			'F#': 6,
			Gb: 6,
			G: 7,
			'G#': 8,
			Ab: 8,
			A: 9,
			'A#': 10,
			Bb: 10,
			B: 11,
			Cb: 11
		};

		// Get the key's value
		const keyValue = noteValues[signature.major];

		// For major scale: I, ii, iii, IV, V, vi, vii°
		// For minor scale: i, ii°, III, iv, v, VI, VII

		// Major scale pattern in semitones
		const majorPattern = [0, 2, 4, 5, 7, 9, 11];

		// Generate actual notes for the scale
		const scaleNotes = majorPattern.map((interval) => {
			const noteValue = (keyValue + interval) % 12;
			// Convert back to note name - simplified version
			const noteIndex = Object.keys(noteValues).findIndex(
				(note) => noteValues[note] === noteValue && !note.includes('b')
			);
			return Object.keys(noteValues)[noteIndex];
		});

		// Chord types for major scale
		const majorChordTypes = ['', 'm', 'm', '', '', 'm', 'dim'];
		const majorChords = scaleNotes.map((note, i) => `${note}${majorChordTypes[i]}`);

		// Minor key is relative minor of the major (6th degree)
		const minorRootValue = noteValues[signature.minor];

		// Minor scale pattern in semitones (natural minor)
		const minorPattern = [0, 2, 3, 5, 7, 8, 10];

		// Generate actual notes for the minor scale
		const minorScaleNotes = minorPattern.map((interval) => {
			const noteValue = (minorRootValue + interval) % 12;
			// Convert back to note name - simplified version
			const noteIndex = Object.keys(noteValues).findIndex(
				(note) => noteValues[note] === noteValue && !note.includes('b')
			);
			return Object.keys(noteValues)[noteIndex];
		});

		// Chord types for minor scale
		const minorChordTypes = ['m', 'dim', '', 'm', 'm', '', ''];
		const minorChords = minorScaleNotes.map((note, i) => `${note}${minorChordTypes[i]}`);

		return {
			major: majorChords,
			minor: minorChords
		};
	}

	// Scale degrees
	$: scaleChords = generateScaleChords(currentSignature);

	// Import and update helper function to safely get note properties, similar to ChordDisplay
	function getNoteProperty(note: any, prop: string, defaultValue: any = '') {
		try {
			if (note[prop] !== undefined) {
				return note[prop];
			}
			if (note[`_${prop}`] !== undefined) {
				return note[`_${prop}`];
			}
			return defaultValue;
		} catch (err) {
			console.error(`Error accessing ${prop} of note:`, note);
			return defaultValue;
		}
	}

	// Helper to extract pitch classes from notes
	function extractPitchClasses(notes: any[]): string[] {
		return Array.from(
			new Set(
				notes.map((note) => {
					const name = getNoteProperty(note, 'name', '');
					const accidental = getNoteProperty(note, 'accidental', '');
					return name + (accidental || '');
				})
			)
		);
	}

	// Function to find matching chords in the scale using tonal.js
	function findMatchingChords(notes: any[]) {
		const majorMatches: number[] = [];
		const minorMatches: number[] = [];

		if (!notes || notes.length === 0) return { majorMatches, minorMatches };
		
		// Extract pitch classes (unique note names without octave)
		const pitchClasses = extractPitchClasses(notes);
		
		// Get detected chords using tonal.js
		const detectedChords = Chord.detect(pitchClasses);
		console.log('Chord.detect results for scale matching:', detectedChords);
		
		// Match with scale chords
		scaleChords.major.forEach((chord, index) => {
			// Check if any detected chord matches this scale chord position
			const matchesPosition = detectedChords.some((detected: string) => {
				// Extract root and type for comparison
				const match = detected.match(/^([A-G][#b]?)(.*)$/);
				if (!match) return false;
				const detectedRoot = match[1];
				
				const chordMatch = chord.match(/^([A-G][#b]?)(.*)$/);
				if (!chordMatch) return false;
				const chordRoot = chordMatch[1];
				
				// Check if the roots match (ignoring octave, considering enharmonic equivalents)
				return detectedRoot.toUpperCase() === chordRoot.toUpperCase();
			});
			
			if (matchesPosition) {
				majorMatches.push(index);
			}
		});
		
		// Check minor scale chords with the same approach
		scaleChords.minor.forEach((chord, index) => {
			const matchesPosition = detectedChords.some((detected: string) => {
				const match = detected.match(/^([A-G][#b]?)(.*)$/);
				if (!match) return false;
				const detectedRoot = match[1];
				
				const chordMatch = chord.match(/^([A-G][#b]?)(.*)$/);
				if (!chordMatch) return false;
				const chordRoot = chordMatch[1];
				
				return detectedRoot.toUpperCase() === chordRoot.toUpperCase();
			});
			
			if (matchesPosition) {
				minorMatches.push(index);
			}
		});

		return { majorMatches, minorMatches };
	}

	// Function to find matching chords for a saved chord using tonal.js
	function findMatchingChordsForSaved(chordNotes: any[]) {
		const majorMatches: number[] = [];
		const minorMatches: number[] = [];

		if (!chordNotes || chordNotes.length === 0) return { majorMatches, minorMatches };

		// Get the signature from the first note of the saved chord
		const savedSignature = chordNotes[0]?.signature;
		if (!savedSignature) return { majorMatches, minorMatches };

		// Generate scale chords using the saved signature
		const savedChordScales = generateScaleChords(savedSignature);
		
		// Extract pitch classes from the chord notes
		const pitchClasses = extractPitchClasses(chordNotes);
		
		// Get detected chords using tonal.js
		const detectedChords = Chord.detect(pitchClasses);
		console.log('Chord.detect results for saved chord:', detectedChords);
		
		// Match with scale chords using the same approach as above
		savedChordScales.major.forEach((chord, index) => {
			const matchesPosition = detectedChords.some((detected: string) => {
				const match = detected.match(/^([A-G][#b]?)(.*)$/);
				if (!match) return false;
				const detectedRoot = match[1];
				
				const chordMatch = chord.match(/^([A-G][#b]?)(.*)$/);
				if (!chordMatch) return false;
				const chordRoot = chordMatch[1];
				
				return detectedRoot.toUpperCase() === chordRoot.toUpperCase();
			});
			
			if (matchesPosition) {
				majorMatches.push(index);
			}
		});
		
		savedChordScales.minor.forEach((chord, index) => {
			const matchesPosition = detectedChords.some((detected: string) => {
				const match = detected.match(/^([A-G][#b]?)(.*)$/);
				if (!match) return false;
				const detectedRoot = match[1];
				
				const chordMatch = chord.match(/^([A-G][#b]?)(.*)$/);
				if (!chordMatch) return false;
				const chordRoot = chordMatch[1];
				
				return detectedRoot.toUpperCase() === chordRoot.toUpperCase();
			});
			
			if (matchesPosition) {
				minorMatches.push(index);
			}
		});

		return { majorMatches, minorMatches };
	}

	// Reactive variable to track matching chords
	$: matchingChords = findMatchingChords(activeNotes);

	// Update matching chords whenever activeNotes changes
	$: if (activeNotes) {
		matchingChords = findMatchingChords(activeNotes);
	}
</script>

<!-- Main Layout with Sticky UI -->
<div class="flex h-screen flex-col">
	<!-- Sticky top navigation -->
	<header class="sticky top-0 z-30 bg-white shadow-md">
		<div class="container mx-auto p-3">
			<div class="header-content flex items-center justify-between">
				<!-- Title and left controls -->
				<div class="header-content flex items-center gap-3">
					<!-- View mode toggle -->
					<div class="flex overflow-hidden rounded-lg border shadow">
						<button
							class="flex-1 px-3 py-1.5 font-medium transition-colors"
							class:bg-blue-500={viewMode === 'keyboard'}
							class:text-white={viewMode === 'keyboard'}
							class:bg-white={viewMode !== 'keyboard'}
							class:text-gray-700={viewMode !== 'keyboard'}
							on:click={() => toggleViewMode('keyboard')}
						>
							<div class="flex items-center justify-center gap-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path d="M13 7H7v6h6V7z" />
									<path
										fill-rule="evenodd"
										d="M7 2a1 1 0 00-1 1v1H5a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3h-1V3a1 1 0 00-1-1H7zm1 3V4h4v1H8z"
										clip-rule="evenodd"
									/>
								</svg>
								<span class="hidden sm:inline">Keyboard</span>
							</div>
						</button>
						<button
							class="flex-1 px-3 py-1.5 font-medium transition-colors"
							class:bg-blue-500={viewMode === 'sheet'}
							class:text-white={viewMode === 'sheet'}
							class:bg-white={viewMode !== 'sheet'}
							class:text-gray-700={viewMode !== 'sheet'}
							on:click={() => toggleViewMode('sheet')}
						>
							<div class="flex items-center justify-center gap-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2-1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1H6z"
										clip-rule="evenodd"
									/>
									<path d="M7 5h6v2H7V5zm0 4h6v2H7V9zm0 4h6v2H7v-2z" />
								</svg>
								<span class="hidden sm:inline">Sheet</span>
							</div>
						</button>
					</div>
					
					<!-- Key Signature Dropdown -->
					<div class="relative">
						<button
							class="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium shadow hover:bg-gray-50"
							on:click={toggleKeyMenu}
						>
							<!-- Music Note Icon -->
							<svg 
								xmlns="http://www.w3.org/2000/svg" 
								class="h-4 w-4 text-blue-600" 
								viewBox="0 0 20 20" 
								fill="currentColor"
							>
								<path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
							</svg>
							<span class="font-medium text-gray-700">Key:</span>
							<span class="ml-1 text-blue-600">{currentSignature.id}</span>
							<svg
								class="ml-1 h-4 w-4"
								fill="currentColor"
								viewBox="0 0 20 20"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									fill-rule="evenodd"
									d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
									clip-rule="evenodd"
								></path>
							</svg>
						</button>

						{#if isKeyMenuOpen}
							<div
								class="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-gray-200 bg-white p-2 shadow-lg"
							>
								<div class="mb-2 border-b pb-1 text-sm font-medium text-gray-700">Key Signatures</div>
								<div class="grid grid-cols-2 gap-2">
									{#each signatures as sig}
										<button
											class="flex flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-blue-50"
											class:bg-blue-100={currentSignature === sig}
											on:click={() => {
												currentSignature = sig;
												isKeyMenuOpen = false;
											}}
										>
											<span class="font-medium">{sig.id}</span>
											<span class="text-xs text-gray-500">{sig.label}</span>
											{#if sig.sharps > 0}
												<span
													class="mt-1 inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
												>
													{sig.sharps}
													{sig.sharps === 1 ? 'sharp' : 'sharps'}
												</span>
											{:else if sig.flats > 0}
												<span
													class="mt-1 inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700"
												>
													{sig.flats}
													{sig.flats === 1 ? 'flat' : 'flats'}
												</span>
											{:else}
												<span
													class="mt-1 inline-flex items-center rounded-md bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-600"
												>
													No sharps/flats
												</span>
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Right-aligned MIDI Device Dropdown -->
				<div class="relative">
					<button
						class="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium shadow hover:bg-gray-50"
						on:click={toggleMenu}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-blue-600"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C.817 14.769 2.156 18 4.828 18h10.343c2.673 0 4.012-3.231 2.122-5.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7zm2 6.172V4h2v4.172a3 3 0 00.879 2.12l1.168 1.168a4 4 0 00-2.324.971l-.243.212a4 4 0 01-5.113.44l-.177-.156a4 4 0 00-2.303-.988l1.168-1.168A3 3 0 009 8.172z"
								clip-rule="evenodd"
							/>
						</svg>
						{selectedInput ? selectedInput.name : 'Select MIDI Device'}
						<svg
							class="ml-1 h-4 w-4"
							fill="currentColor"
							viewBox="0 0 20 20"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								fill-rule="evenodd"
								d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
								clip-rule="evenodd"
							></path>
						</svg>
					</button>

					<!-- Dropdown menu -->
					{#if isMenuOpen}
						<div
							class="dropdown-menu absolute right-0 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg"
							style="z-index: 9999;"
						>
							<div class="p-2">
								<div class="mb-2 flex justify-between border-b pb-2">
									<span class="font-medium text-gray-700">MIDI Devices</span>
									<button
										class="text-xs text-blue-600 hover:text-blue-800"
										on:click={refreshMidiDevices}
										disabled={isInitializing}
									>
										{isInitializing ? 'Refreshing...' : 'Refresh Devices'}
									</button>
								</div>

								{#if midiInputs.length === 0}
									<div class="py-2 text-center text-sm text-gray-500">No MIDI devices found</div>
								{:else}
									<div class="max-h-40 overflow-y-auto py-1">
										{#each midiInputs as input}
											<button
												class="flex w-full items-center rounded px-3 py-2 text-left text-sm hover:bg-gray-100"
												class:bg-blue-50={selectedInput === input}
												class:font-medium={selectedInput === input}
												class:text-blue-700={selectedInput === input}
												on:click={() => {
													selectedInput = input;
													handleInputChange();
												}}
											>
												{input.name}
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Error Message -->
			{#if !midiEnabled}
				<div class="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					<p>{midiError || 'WebMidi is not enabled. Please refresh to try again.'}</p>
				</div>
			{/if}
		</div>
	</header>

	<!-- Fixed layout with scrollable content and fixed bottom keyboard -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Main scrollable content area -->
		<div class="flex-1 overflow-hidden">
			<!-- Scrollable saved chords -->
			<div
				bind:this={chordsContainerElement}
				class="h-full overflow-y-auto pb-[280px]"
				id="chord-container"
			>
				<!-- Increased padding to make room for both keyboard and sheet -->
				{#if savedChords && savedChords.length > 0}
					<div class="space-y-4 p-4">
						<div class="header-content flex items-center justify-between">
							<h2 class="text-lg font-bold text-gray-800">
								Chord Progression ({savedChords.length} chords)
							</h2>

							<div class="flex gap-2">
								<button
									class="flex items-center rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
									on:click={() => setCurrentChord('top')}
								>
									<i class="fas fa-arrow-to-top mr-1"></i>
									Set Start
								</button>
								<button
									class="rounded bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
									on:click={() => {
										savedChords = [];
										persistSavedChords();
										currentChordId = null;
									}}
								>
									Clear All
								</button>
							</div>
						</div>

						<!-- Insertion indicator at the beginning -->
						<div
							id="insert-marker-top"
							class="insertion-marker relative my-3 flex items-center justify-center"
							class:active={currentChordId === 'top'}
							class:hidden={currentChordId !== 'top'}
						>
							<div class="h-[2px] w-full rounded bg-blue-200"></div>
							<div
								class="absolute left-1/2 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white shadow-sm hover:bg-blue-50"
								on:click={() => setCurrentChord('top')}
							>
								<i class="fas fa-plus text-blue-500"></i>
							</div>
						</div>

						<!-- Saved chords - showing the primary view based on view mode -->
						{#each savedChords as chord, index}
							<div
								id={chord.id}
								class="chord-container relative rounded-lg border bg-white p-3 shadow-sm transition-all duration-300 hover:shadow"
							>
								<!-- Delete button -->
								<button
									class="absolute right-2 top-2 text-gray-400 hover:text-red-500"
									on:click={() => deleteChord(chord.id)}
									aria-label="Delete chord"
								>
									<i class="fas fa-times"></i>
								</button>

								<!-- Chord key signature info -->
								<div class="mb-2 text-xs text-gray-500">
									Key: <span class="font-medium text-gray-700">{chord.signature.id}</span>
								</div>

								<!-- Primary visualization based on view mode -->
								<div class="flex w-full">
									<div class="flex-1">
										{#if viewMode === 'keyboard'}
											<Piano notes={chord.notes} readonly={true} compact={true} showLabels={true} />
										{:else}
											<SheetMusic notes={chord.notes} signature={chord.signature} />
											<!-- Add ChordDisplay for saved chords -->
											<ChordDisplay notes={chord.notes} signature={chord.signature} debug={false} />
										{/if}
									</div>

									<!-- Chord reference for saved chords -->
									{#if viewMode === 'sheet'}
										<div class="ml-2 w-64 border-l pl-2">
											<table class="w-full text-xs">
												<tbody>
													<tr>
														<td class="bg-blue-50 px-1 py-0.5 text-xs font-medium">Major</td>
														{#each generateScaleChords(chord.signature).major as sheetChord, i}
															<td
																class="py-0.5 text-center text-xs"
																class:bg-blue-100={i === 0 || i === 3 || i === 4}
																class:bg-green-200={findMatchingChordsForSaved(
																	chord.notes
																).majorMatches.includes(i)}
																class:font-bold={findMatchingChordsForSaved(
																	chord.notes
																).majorMatches.includes(i)}
															>
																{sheetChord}
															</td>
														{/each}
													</tr>
													<tr class="border-t">
														<td class="bg-blue-50 px-1 py-0.5 text-xs font-medium">Minor</td>
														{#each generateScaleChords(chord.signature).minor as sheetChord, i}
															<td
																class="py-0.5 text-center text-xs"
																class:bg-blue-100={i === 0 || i === 3 || i === 4}
																class:bg-green-200={findMatchingChordsForSaved(
																	chord.notes
																).minorMatches.includes(i)}
																class:font-bold={findMatchingChordsForSaved(
																	chord.notes
																).minorMatches.includes(i)}
															>
																{sheetChord}
															</td>
														{/each}
													</tr>
												</tbody>
											</table>
										</div>
									{/if}
								</div>
							</div>

							<!-- Insertion marker after each chord -->
							<div
								id={`insert-marker-${chord.id}`}
								class="insertion-marker relative my-3 flex items-center justify-center"
								class:active={currentChordId === chord.id}
								class:hidden={currentChordId !== chord.id}
							>
								<div class="h-[2px] w-full rounded bg-blue-200"></div>
								<div
									class="absolute left-1/2 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white shadow-sm hover:bg-blue-50"
									on:click={() => setCurrentChord(chord.id)}
								>
									<i class="fas fa-plus text-blue-500"></i>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Focus button that floats in the bottom-right corner -->
	<button
		class="focus-icon"
		on:click={() => {
			// If there's an active insertion point, scroll to it
			if (currentChordId) {
				const markerId =
					currentChordId === 'top' ? 'insert-marker-top' : `insert-marker-${currentChordId}`;
				const marker = document.getElementById(markerId);
				if (marker) {
					marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			} else {
				// Otherwise, focus on the bottom of the list to add a new chord at the end
				if (chordsContainerElement) {
					chordsContainerElement.scrollTop = chordsContainerElement.scrollHeight;
				}
			}
		}}
		aria-label="Focus on current insertion point"
	>
		<i class="fas fa-crosshairs text-xl"></i>
	</button>

	<!-- Sticky player UI at the bottom of the screen - always shows both keyboard and sheet music -->
	<div
		class="sticky bottom-0 z-20 border-t bg-white pb-3 pt-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
	>
		<div class="container mx-auto px-4">
			<div class="mb-3 flex items-center justify-between">
				<div>
					<!-- Save button -->
					<button
						class="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-600 hover:shadow-md active:bg-blue-700 active:scale-95"
						on:click={saveCurrentChord}
					>
						<i class="fas fa-save"></i>
						<span class="ml-1.5">Save Chord</span>
						<span class="ml-1 rounded bg-blue-600/80 px-1.5 py-0.5 text-xs font-medium">Space</span>
					</button>
				</div>

				<!-- Current insertion point indicator -->
				{#if currentChordId}
					<div class="flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
						<span>
							{#if currentChordId === 'top'}
								Adding at beginning
							{:else}
								Adding after selected chord
							{/if}
						</span>
						<button
							class="ml-2 rounded-full bg-blue-100 p-1 text-blue-700 hover:bg-blue-200"
							on:click={() => setCurrentChord(null)}
						>
							<i class="fas fa-times text-xs"></i>
						</button>
					</div>
				{:else}
					<div class="text-xs text-gray-500">Adding at end</div>
				{/if}

				<div>
					<!-- Currently playing indicator -->
					<span class="text-xs font-medium text-gray-600">
						{activeNotes.length > 0 ? activeNotes.length + ' notes playing' : 'No notes playing'}
					</span>
				</div>
			</div>

			<!-- Sheet music display with chord reference table -->
			<div class="mb-3 min-h-[80px] border-b pb-3">
				<!-- Chord Detection & Reference Table in two columns on larger screens, stacked on smaller screens -->
				<div class="flex flex-col sm:flex-row gap-4">
					<!-- Left: Chord Detection -->
					<div class="flex-1">
						{#if activeNotes.length > 0}
							<SheetMusic notes={activeNotes} signature={currentSignature} />
							<ChordDisplay notes={activeNotes} signature={currentSignature} debug={false} />
						{:else}
							<div class="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-400">
								Play notes to see sheet music
							</div>
						{/if}
					</div>
					
					<!-- Right: Chord Reference Table -->
					<div class="flex-1 flex w-full flex-col rounded-lg border bg-white p-3 shadow-sm">
						<h3 class="mb-2 border-b pb-1 text-sm font-medium text-gray-700">
							Key: {currentSignature.label}
						</h3>

						<div class="overflow-hidden rounded border">
							<table class="w-full text-sm">
								<thead class="bg-gray-50 text-xs font-medium text-gray-700">
									<tr>
										<th class="py-1 pl-2 text-left">Scale</th>
										<th class="py-1 text-center">I</th>
										<th class="py-1 text-center">II</th>
										<th class="py-1 text-center">III</th>
										<th class="py-1 text-center">IV</th>
										<th class="py-1 text-center">V</th>
										<th class="py-1 text-center">VI</th>
										<th class="py-1 text-center">VII</th>
									</tr>
								</thead>
								<tbody>
									<tr class="border-t">
										<td class="bg-blue-50 px-2 py-1 text-xs font-medium">Major</td>
										{#each scaleChords.major as chord, i}
											<td
												class="py-1 text-center text-xs"
												class:bg-blue-100={i === 0 || i === 3 || i === 4}
												class:bg-green-200={matchingChords.majorMatches.includes(i)}
												class:font-bold={matchingChords.majorMatches.includes(i)}
											>
												{chord}
											</td>
										{/each}
									</tr>
									<tr class="border-t">
										<td class="bg-blue-50 px-2 py-1 text-xs font-medium">Minor</td>
										{#each scaleChords.minor as chord, i}
											<td
												class="py-1 text-center text-xs"
												class:bg-blue-100={i === 0 || i === 3 || i === 4}
												class:bg-green-200={matchingChords.minorMatches.includes(i)}
												class:font-bold={matchingChords.minorMatches.includes(i)}
											>
												{chord}
											</td>
										{/each}
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>

			<!-- Always show the piano keyboard -->
			<div class="piano-wrapper">
				<Piano notes={activeNotes} on:notePress={handlePianoNotePress} />
			</div>
		</div>
	</div>
</div>

<style>
	.chord-container {
		margin-bottom: 1rem;
	}

	div::-webkit-scrollbar {
		width: 8px;
	}

	div::-webkit-scrollbar-track {
		background: #f1f1f1;
		border-radius: 10px;
	}

	div::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 10px;
	}

	div::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}

	.insertion-marker {
		height: 2rem;
		position: relative;
		margin: 0.5rem 0;
	}

	.insertion-marker .insertion-line {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background-color: #e5e7eb;
		top: 50%;
		transform: translateY(-50%);
	}

	.insertion-marker.active .insertion-line {
		@apply h-[2px] bg-blue-300;
	}

	.insertion-marker .marker-icon {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 28px;
		height: 28px;
		background-color: white;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		cursor: pointer;
		z-index: 5;
	}

	.insertion-marker.active .marker-icon {
		@apply h-8 w-8 bg-blue-500 text-white shadow-md;
	}

	.focus-icon {
		position: fixed;
		bottom: 20px;
		right: 20px;
		width: 40px;
		height: 40px;
		background-color: #3b82f6;
		color: white;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		z-index: 30;
		cursor: pointer;
	}
</style>
