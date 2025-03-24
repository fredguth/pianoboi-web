<script lang="ts">
	import { browser } from '$app/environment';
	import type { Signature } from '$lib/types/signatures';
	import { signatures } from '$lib/types/signatures';
	import { Chord } from '@tonaljs/tonal';
	import { onDestroy, onMount } from 'svelte';
	import type { Input, NoteMessageEvent } from 'webmidi';
	import { WebMidi } from 'webmidi';
	import ChordDisplay from './ChordDisplay.svelte';
	import Piano from './Piano.svelte';
	import SheetMusic from './SheetMusic.svelte';

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
	let currentChords: string[] = [];

	// Audio synthesis
	let audioContext: AudioContext | null = null;
	let masterGainNode: GainNode | null = null;
	let activeAudioNodes: Record<string, any> = {};
	let playingAudioNodes: Array<{ note: number; nodes: any }> = [];
	let samplesLoaded = false;
	let loadingProgress = 0;

	// Piano samples cache
	let pianoSamples: { [key: string]: AudioBuffer } = {};

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
	let playingChordId: string | null = null; // Track which chord is currently being played

	// The actual available sample files we have in static/audio/piano10/
	const availableSamples = [
		'A0v10.mp3',
		'A1v10.mp3',
		'A2v10.mp3',
		'A3v10.mp3',
		'A4v10.mp3',
		'A5v10.mp3',
		'A6v10.mp3',
		'A7v10.mp3',
		'C1v10.mp3',
		'C2v10.mp3',
		'C3v10.mp3',
		'C4v10.mp3',
		'C5v10.mp3',
		'C6v10.mp3',
		'C7v10.mp3',
		'C8v10.mp3',
		'Ds1v10.mp3',
		'Ds2v10.mp3',
		'Ds3v10.mp3',
		'Ds4v10.mp3',
		'Ds5v10.mp3',
		'Ds6v10.mp3',
		'Ds7v10.mp3',
		'Fs1v10.mp3',
		'Fs2v10.mp3',
		'Fs3v10.mp3',
		'Fs4v10.mp3',
		'Fs5v10.mp3',
		'Fs6v10.mp3',
		'Fs7v10.mp3'
	];

	// This maps MIDI note numbers to sample filenames
	// The format of the samples is {NOTE}{OCTAVE}v{VELOCITY}.mp3
	// IMPORTANT: We only have samples for A, C, Ds, and Fs notes (D-sharp and F-sharp using 's' instead of '#')
	const sampleMap: Record<number, string> = {
		21: 'A0v10.mp3', // A0
		33: 'A1v10.mp3', // A1
		45: 'A2v10.mp3', // A2
		57: 'A3v10.mp3', // A3
		69: 'A4v10.mp3', // A4
		81: 'A5v10.mp3', // A5
		93: 'A6v10.mp3', // A6
		105: 'A7v10.mp3', // A7
		24: 'C1v10.mp3', // C1
		36: 'C2v10.mp3', // C2
		48: 'C3v10.mp3', // C3
		60: 'C4v10.mp3', // C4 (middle C)
		72: 'C5v10.mp3', // C5
		84: 'C6v10.mp3', // C6
		96: 'C7v10.mp3', // C7
		108: 'C8v10.mp3', // C8
		27: 'Ds1v10.mp3', // D#1
		39: 'Ds2v10.mp3', // D#2
		51: 'Ds3v10.mp3', // D#3
		63: 'Ds4v10.mp3', // D#4
		75: 'Ds5v10.mp3', // D#5
		87: 'Ds6v10.mp3', // D#6
		99: 'Ds7v10.mp3', // D#7
		30: 'Fs1v10.mp3', // F#1
		42: 'Fs2v10.mp3', // F#2
		54: 'Fs3v10.mp3', // F#3
		66: 'Fs4v10.mp3', // F#4
		78: 'Fs5v10.mp3', // F#5
		90: 'Fs6v10.mp3', // F#6
		102: 'Fs7v10.mp3' // F#7
	};

	// Initialize audio
	function initAudio() {
		if (audioContext) return;

		try {
			audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
			console.log('Audio context created');
			loadPianoSamples();
		} catch (error) {
			console.error('Failed to create audio context:', error);
		}
	}

	// Load piano samples
	async function loadPianoSamples() {
		if (!audioContext) return;

		try {
			// Use static folder path (the samples were copied there)
			const sampleBaseUrl = '/audio/piano10/';

			// Get the number of samples we need to load
			const totalSamples = availableSamples.length;
			let loadedSamples = 0;

			console.log(`Loading piano samples from: ${sampleBaseUrl}`);
			console.log(`Attempting to load ${totalSamples} samples`);

			// Function to load a single sample
			const loadSample = async (sampleFileName: string) => {
				try {
					console.log(`Trying to load: ${sampleBaseUrl}${sampleFileName}`);
					const response = await fetch(sampleBaseUrl + sampleFileName);
					if (!response.ok) {
						throw new Error(
							`Failed to fetch ${sampleFileName}: ${response.status} ${response.statusText}`
						);
					}

					console.log(`Fetched ${sampleFileName} successfully`);
					const arrayBuffer = await response.arrayBuffer();
					console.log(`Got array buffer for ${sampleFileName}: ${arrayBuffer.byteLength} bytes`);

					try {
						const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);
						console.log(`Decoded audio for ${sampleFileName}: ${audioBuffer.duration} seconds`);
						pianoSamples[sampleFileName] = audioBuffer;
						loadedSamples++;
						loadingProgress = Math.floor((loadedSamples / totalSamples) * 100);
					} catch (decodeErr) {
						console.error(`Failed to decode ${sampleFileName}:`, decodeErr);
					}
				} catch (err) {
					console.error(`Error loading sample ${sampleFileName}:`, err);
				}
			};

			// Load all the samples in parallel for faster loading
			const loadPromises = availableSamples.map((sample) => loadSample(sample));
			await Promise.all(loadPromises);

			if (loadedSamples > 0) {
				console.log(`Successfully loaded ${loadedSamples}/${totalSamples} piano samples`);
				samplesLoaded = true;
			} else {
				console.error('Failed to load any piano samples');
			}
		} catch (error) {
			console.error('Error in loadPianoSamples:', error);
		}
	}

	// Function to convert MIDI note number to frequency
	function midiToFrequency(midiNote: number): number {
		return 440 * Math.pow(2, (midiNote - 69) / 12);
	}

	// Find the closest sample for a given note
	function findClosestSample(midiNote: number): string {
		// Debug log for note detection
		const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
		const noteName = noteNames[midiNote % 12];
		const octave = Math.floor(midiNote / 12) - 1;
		console.log(`Finding sample for MIDI note ${midiNote}: ${noteName}${octave}`);

		// CRITICAL: First check if this exact MIDI note has a dedicated sample in our sampleMap
		if (sampleMap[midiNote]) {
			console.log(`Using exact sample match from sampleMap: ${sampleMap[midiNote]}`);
			return sampleMap[midiNote];
		}

		// ----- IMPORTANT -----
		// We only have samples for A, C, Ds, and Fs notes
		// We need to map other notes to these available samples with pitch shifting
		// ----- IMPORTANT -----

		// For each note, map it to one of our available sample types
		// The note type mapping strategy based on available samples
		const noteTypeMapping: {
			[key: string]: { type: string; octaveOffset: number; semitones: number };
		} = {
			// Note: type is the sample type to use, octaveOffset adjusts the octave, semitones is the pitch shift
			C: { type: 'C', octaveOffset: 0, semitones: 0 }, // Use C directly
			'C#': { type: 'C', octaveOffset: 0, semitones: 1 }, // Use C, shift up 1 semitone
			D: { type: 'Ds', octaveOffset: 0, semitones: -1 }, // Use Ds, shift down 1 semitone
			'D#': { type: 'Ds', octaveOffset: 0, semitones: 0 }, // Use Ds directly
			E: { type: 'Ds', octaveOffset: 0, semitones: 1 }, // Use Ds, shift up 1 semitone
			F: { type: 'Fs', octaveOffset: 0, semitones: -1 }, // Use Fs, shift down 1 semitone
			'F#': { type: 'Fs', octaveOffset: 0, semitones: 0 }, // Use Fs directly
			G: { type: 'Fs', octaveOffset: 0, semitones: 1 }, // Use Fs, shift up 1 semitone
			'G#': { type: 'A', octaveOffset: 0, semitones: -1 }, // Use A, shift down 1 semitone
			A: { type: 'A', octaveOffset: 0, semitones: 0 }, // Use A directly
			'A#': { type: 'A', octaveOffset: 0, semitones: 1 }, // Use A, shift up 1 semitone
			B: { type: 'A', octaveOffset: 0, semitones: 2 } // Use C from same octave, shift down 1
		};

		// Get mapping info for this note type
		const mapping = noteTypeMapping[noteName];
		if (!mapping) {
			console.error(`No mapping found for note ${noteName}`);
			return availableSamples[0]; // Fallback to first available sample
		}

		// Calculate target octave with any offsets
		const targetOctave = octave + mapping.octaveOffset;

		// Construct a complete filename with the sample type, octave and velocity
		// ALWAYS use the full filename format
		const sampleFilename = `${mapping.type}${targetOctave}v10.mp3`;

		// Check if this sample exists in our available samples list
		if (availableSamples.includes(sampleFilename)) {
			console.log(
				`Using mapped sample ${sampleFilename} for ${noteName}${octave} (MIDI ${midiNote}) with pitch shift ${mapping.semitones}`
			);
			return sampleFilename;
		}

		// If the exact octave sample isn't available, find closest octave for the same note type
		// First get all samples of this type
		const samplesOfType = availableSamples.filter(
			(sample) => sample.startsWith(mapping.type) && sample.endsWith('v10.mp3')
		);

		if (samplesOfType.length === 0) {
			// Fallback to A4 as a safe default if no samples of the desired type exist
			console.warn(
				`No samples of type ${mapping.type} found for ${noteName}${octave}, using fallback`
			);
			return 'A4v10.mp3';
		}

		// Find closest octave for this sample type
		let bestSample = '';
		let smallestOctaveDiff = Infinity;

		for (const sample of samplesOfType) {
			// Extract the octave number from the sample filename
			// Support both 's' and '#' in filenames for compatibility
			const match = sample.match(/([A-G][s#]?)(\d+)v/);
			if (!match) continue;

			const sampleOctave = parseInt(match[2], 10);
			const octaveDiff = Math.abs(sampleOctave - targetOctave);

			if (octaveDiff < smallestOctaveDiff) {
				smallestOctaveDiff = octaveDiff;
				bestSample = sample;
			}
		}

		console.log(
			`Using closest octave sample ${bestSample} for ${noteName}${octave} (MIDI ${midiNote})`
		);
		return bestSample;
	}

	// Function to get the semitone distance between MIDI numbers
	function getSemitoneDistance(midiNote: number, baseMidiNote: number): number {
		return midiNote - baseMidiNote;
	}

	// Play a note using piano samples or fallback to oscillator
	function playNote(midiNote: number) {
		if (!audioContext) {
			initAudio();
			if (!audioContext) return null;
		}

		try {
			// Check if we have enough samples loaded
			if (samplesLoaded && Object.keys(pianoSamples).length > 0) {
				// Get the note information
				const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
				const noteName = noteNames[midiNote % 12];
				const octave = Math.floor(midiNote / 12) - 1;

				// Find the closest sample
				const sampleName = findClosestSample(midiNote);

				// Check if we actually have this sample loaded
				if (pianoSamples[sampleName]) {
					console.log(`Playing note ${midiNote} (${noteName}${octave}) using sample ${sampleName}`);

					// Create audio buffer source
					const source = audioContext.createBufferSource();
					source.buffer = pianoSamples[sampleName];

					// Calculate the correct pitch adjustment based on the mapping information
					// and the actual sample we're using

					// Get the note and octave from the sample filename
					// Support both 's' and '#' in filenames
					const match = sampleName.match(/([A-G][s#]?)(\d+)v/);
					if (!match) {
						console.error(`Invalid sample name format: ${sampleName}`);
						return createOscillator(midiNote);
					}

					const sampleNoteName = match[1];
					const sampleOctave = parseInt(match[2], 10);

					// Calculate the sample's MIDI note number
					const sampleMidiNote = calculateMidiFromName(sampleNoteName, sampleOctave);

					// Calculate the semitone difference for pitch shifting
					const semitones = midiNote - sampleMidiNote;

					console.log(
						`Note ${midiNote} (${noteName}${octave}), Sample ${sampleName} (MIDI: ${sampleMidiNote}), Semitones: ${semitones}`
					);

					// Apply pitch adjustment with limits to prevent extreme stretching
					// Allow more pitch shifting for B notes but limit others to +/- 4 semitones for optimal sound quality
					const maxAllowedShift = noteName === 'B' ? 12 : 4;

					// Use the oscillator for extreme shifts
					if (Math.abs(semitones) > maxAllowedShift) {
						console.log(
							`Excessive pitch shift (${semitones} semitones) for note ${midiNote}, using oscillator`
						);
						return createOscillator(midiNote);
					}

					// Calculate the pitch ratio
					const ratio = Math.pow(2, semitones / 12);
					source.playbackRate.value = ratio;

					console.log(`Playback rate: ${ratio.toFixed(3)}`);

					// Create gain node for envelope
					const gainNode = audioContext.createGain();
					gainNode.gain.value = 0.0; // Start silent and ramp up

					// Connect nodes
					source.connect(gainNode);
					gainNode.connect(audioContext.destination);

					// Start playing
					source.start();

					// Apply envelope: fairly rapid attack, slow decay
					const now = audioContext.currentTime;

					// Attack phase
					gainNode.gain.setValueAtTime(0, now);
					gainNode.gain.linearRampToValueAtTime(1, now + 0.02); // 20ms attack

					// Adjust decay based on pitch shift - shorter decay for higher shifts
					const pitchShiftFactor = Math.abs(semitones) / 12;
					const decayTime = 0.5 * (1 - pitchShiftFactor * 0.2);
					gainNode.gain.linearRampToValueAtTime(0.7, now + decayTime);

					// Release time also varies with pitch shift
					const releaseTime = 4.0 * (1 - pitchShiftFactor * 0.1);
					gainNode.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

					// Store the nodes to be able to stop them later
					const nodes = { source, gainNode };
					return nodes;
				} else {
					console.warn(
						`Sample ${sampleName} not found for note ${midiNote}, falling back to oscillator`
					);
					return createOscillator(midiNote);
				}
			} else {
				console.log(`Using oscillator for note ${midiNote} because samples not loaded`);
				return createOscillator(midiNote);
			}
		} catch (error) {
			console.error('Error playing note:', error);
			return createOscillator(midiNote); // Try oscillator as last resort
		}
	}

	// Calculate MIDI note number from note name and octave
	function calculateMidiFromName(noteName: string, octave: number): number {
		// Normalize both # and s notations to use # internally
		const normalizedName = normalizeSharpNotation(noteName);

		const noteValues: Record<string, number> = {
			C: 0,
			'C#': 1,
			D: 2,
			'D#': 3,
			E: 4,
			F: 5,
			'F#': 6,
			G: 7,
			'G#': 8,
			A: 9,
			'A#': 10,
			B: 11,
			// Add flat equivalents
			Db: 1,
			Eb: 3,
			Gb: 6,
			Ab: 8,
			Bb: 10
		};

		if (!(normalizedName in noteValues)) {
			console.error(`Invalid note name: ${noteName} (normalized to ${normalizedName})`);
			return 60; // Default to middle C
		}

		const noteValue = noteValues[normalizedName];
		return (octave + 1) * 12 + noteValue;
	}

	// Create and play oscillator for fallback
	function createOscillator(midiNote: number) {
		if (!audioContext) return null;

		try {
			// Convert MIDI note to frequency: 440 * 2^((midiNote - 69) / 12)
			// Ensure the note is within playable range (21-108)
			const clampedNote = Math.max(21, Math.min(108, midiNote));
			const frequency = 440 * Math.pow(2, (clampedNote - 69) / 12);

			// Safety check for valid frequency
			if (!isFinite(frequency)) {
				console.error(`Invalid frequency for MIDI note ${midiNote}, using default`);
				return null;
			}

			// Create oscillator
			const oscillator = audioContext.createOscillator();
			oscillator.type = 'sine';
			oscillator.frequency.value = frequency;

			// Create gain node for envelope
			const gainNode = audioContext.createGain();
			gainNode.gain.value = 0.2; // Lower volume for oscillator

			// Add sub oscillator for richer sound
			const subOscillator = audioContext.createOscillator();
			subOscillator.type = 'triangle';
			subOscillator.frequency.value = frequency / 2;

			const subGainNode = audioContext.createGain();
			subGainNode.gain.value = 0.1;

			// Connect everything
			oscillator.connect(gainNode);
			subOscillator.connect(subGainNode);
			gainNode.connect(audioContext.destination);
			subGainNode.connect(audioContext.destination);

			// Start oscillators
			oscillator.start();
			subOscillator.start();

			// Apply envelope
			const now = audioContext.currentTime;
			gainNode.gain.setValueAtTime(0, now);
			gainNode.gain.linearRampToValueAtTime(0.2, now + 0.02);
			gainNode.gain.linearRampToValueAtTime(0.15, now + 0.3);
			gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

			subGainNode.gain.setValueAtTime(0, now);
			subGainNode.gain.linearRampToValueAtTime(0.1, now + 0.02);
			subGainNode.gain.linearRampToValueAtTime(0.08, now + 0.3);
			subGainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

			return { source: oscillator, gainNode, subOscillator, subGainNode };
		} catch (error) {
			console.error('Error creating oscillator:', error);
			return null;
		}
	}

	// Stop a note
	function stopNote(nodes: any) {
		if (!nodes) return;

		try {
			const now = audioContext?.currentTime || 0;

			// Gracefully fade out main oscillator/sample
			if (nodes.gainNode) {
				nodes.gainNode.gain.cancelScheduledValues(now);
				nodes.gainNode.gain.setValueAtTime(nodes.gainNode.gain.value, now);
				nodes.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

				// Stop the source after the fade out
				setTimeout(() => {
					try {
						if (nodes.source && nodes.source.stop) {
							nodes.source.stop();
						}
					} catch (e) {
						// Ignore errors if already stopped
					}
				}, 100);
			}

			// Also fade out sub oscillator if it exists
			if (nodes.subGainNode) {
				nodes.subGainNode.gain.cancelScheduledValues(now);
				nodes.subGainNode.gain.setValueAtTime(nodes.subGainNode.gain.value, now);
				nodes.subGainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

				// Stop the sub oscillator after the fade out
				setTimeout(() => {
					try {
						if (nodes.subOscillator && nodes.subOscillator.stop) {
							nodes.subOscillator.stop();
						}
					} catch (e) {
						// Ignore errors if already stopped
					}
				}, 100);
			}
		} catch (error) {
			console.error('Error stopping note:', error);
		}
	}

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
				number:
					note.number ||
					calculateNoteNumber(
						note.name || note._name,
						note.accidental || note._accidental || '',
						note.octave || note._octave
					),
				identifier:
					note.identifier ||
					`${note.name || note._name}${note.accidental || note._accidental || ''}${note.octave || note._octave}`,
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

	// Function for clearing all active notes (used when deleting a chord)
	function clearActiveNotes() {
		// Clear the active notes array
		activeNotes = [];

		// Stop any playing audio
		if (playingAudioNodes.length > 0) {
			playingAudioNodes.forEach((item) => {
				stopNote(item.nodes);
			});
			playingAudioNodes = [];
		}

		if (Object.keys(activeAudioNodes).length > 0) {
			Object.values(activeAudioNodes).forEach((nodes) => {
				stopNote(nodes);
			});
			activeAudioNodes = {};
		}
	}

	// Delete a chord
	function deleteChord(id: string) {
		// If the chord being deleted is currently playing, stop it
		if (playingChordId === id) {
			stopChord();
		}

		// Remove the chord from the array
		savedChords = savedChords.filter((chord) => chord.id !== id);
		persistSavedChords();

		// Clear any notes that are currently playing
		clearActiveNotes();

		// Update current chord ID if needed
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

	// Listen for keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		// Space to save chord
		if (event.code === 'Space' && !event.repeat) {
			event.preventDefault(); // Prevent scrolling
			saveCurrentChord();
		}

		// 'P' key to play the most recent chord
		if (event.code === 'KeyP' && !event.repeat && savedChords.length > 0) {
			event.preventDefault();
			// Get the most recent chord
			const lastChord = savedChords[savedChords.length - 1];
			playChord(lastChord.id, lastChord.notes);
		}
	}

	onMount(() => {
		initializeWebMidi();
		loadSavedChords();
		initAudio();
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

		// Clean up audio resources
		clearActiveNotes();
		if (audioContext) {
			audioContext.close().catch((e) => console.error('Error closing audio context:', e));
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

			// Play the note
			playNote(note.number);
		} else {
			// Simulate note-off
			const noteToRemove = activeNotes.find(
				(note) =>
					note.name === noteData.name.toUpperCase() &&
					note.accidental === noteData.accidental &&
					note.octave === noteData.octave
			);

			// Stop the audio for this note
			if (noteToRemove) {
				stopNote(activeAudioNodes[noteToRemove.identifier]);
			}

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

	// Function to play a chord
	function playChord(chordId: string, notes: any[]) {
		// Stop previous playing chord if any
		if (playingChordId) {
			stopChord();
		}

		console.log(`Playing chord ${chordId}:`, notes);
		playingChordId = chordId;

		// Stagger note timing slightly for more natural sound
		const audioNodes: any[] = [];
		notes.forEach((note, index) => {
			setTimeout(() => {
				// Extract note information and convert to MIDI
				let midiNote: number;

				if (typeof note === 'number') {
					// Already a MIDI number
					midiNote = note;
				} else if (note.number !== undefined) {
					// Has a direct MIDI number property
					midiNote = note.number;
				} else if (note.name !== undefined) {
					// Has note name, accidental, and octave - calculate MIDI
					const noteName = note.name + (note.accidental || '');
					const octave = note.octave;
					console.log(`Converting note ${noteName}${octave} to MIDI`);
					midiNote = calculateMidiFromName(noteName, octave);
				} else {
					console.error('Unrecognized note format:', note);
					return;
				}

				// Ensure MIDI note is valid (piano range is 21-108)
				if (typeof midiNote !== 'number' || isNaN(midiNote)) {
					console.error(`Invalid MIDI note number: ${midiNote}`);
					return;
				}

				// Clamp to valid piano range
				const clampedMidiNote = Math.max(21, Math.min(108, midiNote));
				if (clampedMidiNote !== midiNote) {
					console.log(`Clamped MIDI note ${midiNote} to ${clampedMidiNote} (valid piano range)`);
					midiNote = clampedMidiNote;
				}

				console.log(`Playing chord note with MIDI number: ${midiNote}`);
				const nodes = playNote(midiNote);
				if (nodes) {
					audioNodes.push({ note: midiNote, nodes });
					playingAudioNodes.push({ note: midiNote, nodes });
				}
			}, index * 10); // 10ms stagger between notes
		});
	}

	// Function to stop the currently playing chord
	function stopChord() {
		if (playingAudioNodes.length > 0) {
			playingAudioNodes.forEach((item) => {
				stopNote(item.nodes);
			});
			playingAudioNodes = [];
		}
		playingChordId = null;
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

	// Convert between sharp notations: D# <-> Ds
	function normalizeSharpNotation(noteName: string): string {
		// If we have s-style notation (Ds, Fs), convert to #-style (D#, F#)
		if (noteName.endsWith('s')) {
			return noteName.replace(/([A-G])s/, '$1#');
		}
		// If we have #-style notation, keep as is
		return noteName;
	}

	// Convert note name to our filename format (e.g., convert D# -> Ds for filenames)
	function noteToFilenameFormat(noteName: string): string {
		return noteName.replace('#', 's');
	}

	// Add state for info tooltip
	let isInfoOpen = false;
	function toggleInfo() {
		isInfoOpen = !isInfoOpen;
	}

	// Function to check if a chord is in the current key
	function isInKey(chord: string): boolean {
		const majorChords = scaleChords.major;
		const minorChords = scaleChords.minor;
		return majorChords.includes(chord) || minorChords.includes(chord);
	}

	// Update currentChords whenever activeNotes changes
	$: if (activeNotes) {
		const pitchClasses = extractPitchClasses(activeNotes);
		currentChords = Chord.detect(pitchClasses);
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
								<path
									d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z"
								/>
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
								<div class="mb-2 border-b pb-1 text-sm font-medium text-gray-700">
									Key Signatures
								</div>
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
								class:bg-blue-50={playingChordId === chord.id}
							>
								<div class="mb-2 flex items-center justify-between text-xs text-gray-500">
									<div>
										Key: <span class="font-medium text-gray-700">{chord.signature.id}</span>
									</div>
								</div>

								<!-- Delete button - positioned at top right -->
								<button
									class="absolute right-2 top-2 text-gray-400 hover:text-red-500"
									on:click={() => deleteChord(chord.id)}
									aria-label="Delete chord"
								>
									<i class="fas fa-times"></i>
								</button>

								<!-- Primary visualization based on view mode -->
								<div class="flex w-full">
									<div class="flex-1 overflow-hidden">
										{#if viewMode === 'keyboard'}
											<div class="overflow-x-auto">
												<Piano
													notes={chord.notes}
													readonly={true}
													compact={true}
													showLabels={true}
												/>
											</div>
										{:else}
											<div class="flex flex-col gap-4 sm:flex-row">
												<!-- Left: Sheet Music -->
												<div class="flex-1">
													<SheetMusic notes={chord.notes} signature={chord.signature} />
												</div>

												<!-- Right: Chord Display Table -->
												<div class="flex flex-1 flex-col gap-3">
													<ChordDisplay
														notes={chord.notes}
														signature={chord.signature}
														debug={false}
													/>

													<!-- Scale Degree Reference Table -->
													<div
														class="flex w-full flex-col rounded-lg border bg-white p-3 shadow-sm"
													>
														<h3 class="mb-2 border-b pb-1 text-sm font-medium text-gray-700">
															Key: {chord.signature.label}
														</h3>

														{#if chord.signature}
															{@const savedChordScales = generateScaleChords(chord.signature)}
															{@const matches = findMatchingChordsForSaved(chord.notes)}

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
																			<td class="bg-blue-50 px-2 py-1 text-xs font-medium">Major</td
																			>
																			{#each savedChordScales.major as chord, i}
																				<td
																					class="py-1 text-center text-xs"
																					class:bg-blue-100={i === 0 || i === 3 || i === 4}
																					class:bg-green-200={matches.majorMatches.includes(i)}
																					class:font-bold={matches.majorMatches.includes(i)}
																				>
																					<div>{chord}</div>
																					<div class="mt-0.5 text-[10px] text-gray-500">
																						{i === 0
																							? 'I'
																							: i === 1
																								? 'ii'
																								: i === 2
																									? 'iii'
																									: i === 3
																										? 'IV'
																										: i === 4
																											? 'V'
																											: i === 5
																												? 'vi'
																												: 'vii°'}
																					</div>
																				</td>
																			{/each}
																		</tr>
																		<tr class="border-t">
																			<td class="bg-blue-50 px-2 py-1 text-xs font-medium">Minor</td
																			>
																			{#each savedChordScales.minor as chord, i}
																				<td
																					class="py-1 text-center text-xs"
																					class:bg-blue-100={i === 0 || i === 3 || i === 4}
																					class:bg-green-200={matches.minorMatches.includes(i)}
																					class:font-bold={matches.minorMatches.includes(i)}
																				>
																					<div>{chord}</div>
																					<div class="mt-0.5 text-[10px] text-gray-500">
																						{i === 0
																							? 'i'
																							: i === 1
																								? 'ii°'
																								: i === 2
																									? 'III'
																									: i === 3
																										? 'iv'
																										: i === 4
																											? 'v'
																											: i === 5
																												? 'VI'
																												: 'VII'}
																					</div>
																				</td>
																			{/each}
																		</tr>
																	</tbody>
																</table>
															</div>
														{/if}
													</div>
												</div>
											</div>
										{/if}
									</div>

									<!-- Play button - positioned at bottom right -->
									<button
										class="absolute bottom-3 right-3 flex items-center rounded-full bg-blue-500 px-2 py-1 text-white transition-colors hover:bg-blue-600"
										class:animate-pulse={playingChordId === chord.id}
										on:click={() => playChord(chord.id, chord.notes)}
										aria-label="Play chord"
										title="Play chord (or press 'P' to play latest chord)"
									>
										<i class="fas fa-play mr-1 text-xs"></i>
										<span class="text-xs">Play</span>
									</button>
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
						class="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-600 hover:shadow-md active:scale-95 active:bg-blue-700"
						on:click={saveCurrentChord}
						title="Save the current chord (Space)"
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
					<span class="flex items-center text-xs font-medium text-gray-600">
						{#if activeNotes.length > 0}
							<span class="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"
							></span>
							{activeNotes.length} notes playing
						{:else}
							<span class="mr-2 inline-block h-2 w-2 rounded-full bg-gray-300"></span>
							No notes playing
						{/if}
					</span>
				</div>
			</div>

			<!-- Sheet music display with chord reference table -->
			<div class="mb-3 min-h-[80px] border-b pb-3">
				<!-- Chord Detection & Reference Table in two columns on larger screens, stacked on smaller screens -->
				<div class="flex flex-col gap-4 sm:flex-row">
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
					<div class="flex w-full flex-1 flex-col rounded-lg border bg-white p-3 shadow-sm">
						<div class="mb-4 flex items-center justify-between border-b pb-2">
							<h3 class="text-sm font-medium text-gray-700">
								Key: {currentSignature.label}
							</h3>

							<!-- Info Button -->
							<div class="relative">
								<button
									class="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
									on:click={toggleInfo}
									title="Show chord notation info"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fill-rule="evenodd"
											d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
											clip-rule="evenodd"
										/>
									</svg>
								</button>

								{#if isInfoOpen}
									<div
										class="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
									>
										<div class="space-y-2 text-xs text-gray-500">
											<p>
												<span class="font-medium">Major Scale:</span> The highlighted chords are the
												primary chords:
												<span class="font-mono">I</span> (tonic),
												<span class="font-mono">IV</span> (subdominant), and
												<span class="font-mono">V</span> (dominant).
											</p>
											<p>
												Uppercase numerals (I, IV, V) indicate major chords, while lowercase (ii,
												iii, vi) indicate minor chords. The diminished symbol (°) in vii° indicates
												a diminished chord.
											</p>
											<p>
												<span class="font-medium">Minor Scale:</span> The highlighted chords are the
												primary chords:
												<span class="font-mono">i</span> (tonic),
												<span class="font-mono">iv</span> (subdominant), and
												<span class="font-mono">v</span> (dominant).
											</p>
											<p>
												Lowercase numerals (i, ii°, iv, v) indicate minor chords, while uppercase
												(III, VI, VII) indicate major chords. The diminished symbol (°) in ii°
												indicates a diminished chord.
											</p>
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Detected Chords Display -->
						{#if activeNotes.length > 0}
							<div class="mb-4">
								<h4 class="mb-2 text-sm font-medium text-gray-700">Detected Chords</h4>
								{#if currentChords.length === 0}
									<p class="text-sm text-gray-500">No recognized chord</p>
								{:else}
									<div class="flex flex-wrap gap-2">
										{#each currentChords as chord}
											<span
												class="rounded-full px-3 py-1 text-sm font-medium"
												class:bg-green-100={isInKey(chord)}
												class:text-green-800={isInKey(chord)}
												class:bg-blue-100={!isInKey(chord)}
												class:text-blue-800={!isInKey(chord)}
											>
												{chord}
												{#if isInKey(chord)}
													<span class="ml-1 text-xs text-green-600">(in key)</span>
												{/if}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

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
												<div>{chord}</div>
												<div class="mt-0.5 text-[10px] text-gray-500">
													{i === 0
														? 'I'
														: i === 1
															? 'ii'
															: i === 2
																? 'iii'
																: i === 3
																	? 'IV'
																	: i === 4
																		? 'V'
																		: i === 5
																			? 'vi'
																			: 'vii°'}
												</div>
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
												<div>{chord}</div>
												<div class="mt-0.5 text-[10px] text-gray-500">
													{i === 0
														? 'i'
														: i === 1
															? 'ii°'
															: i === 2
																? 'III'
																: i === 3
																	? 'iv'
																	: i === 4
																		? 'v'
																		: i === 5
																			? 'VI'
																			: 'VII'}
												</div>
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

			<!-- Keyboard shortcuts info -->
			<div class="mt-3 border-t pt-2 text-center text-xs text-gray-500">
				{#if samplesLoaded}
					<p>
						Keyboard shortcuts: <span class="mx-1 rounded bg-gray-200 px-1 py-0.5 font-mono"
							>Space</span
						>
						to save chord,
						<span class="mx-1 rounded bg-gray-200 px-1 py-0.5 font-mono">P</span> to play most recent
						chord
					</p>
				{:else}
					<div class="flex flex-col items-center">
						<p class="mb-1">Loading piano samples: {loadingProgress}%</p>
						<div class="h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
							<div class="h-full rounded-full bg-blue-500" style="width: {loadingProgress}%"></div>
						</div>
					</div>
				{/if}
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
