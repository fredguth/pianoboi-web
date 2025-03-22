<script lang="ts">
	import { browser } from '$app/environment';
	import type { Signature } from '$lib/types/signatures';
	import { signatures } from '$lib/types/signatures';
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

	// Load saved chords from localStorage
	function loadSavedChords() {
		if (!browser) return;

		try {
			const savedData = localStorage.getItem('pianoboi-saved-chords');
			if (savedData) {
				// Need to reconstruct saved chords with proper Signature object references
				const parsed = JSON.parse(savedData);
				savedChords = parsed.map((chord: any) => {
					// Find the matching signature object by ID
					const matchedSignature =
						signatures.find((sig) => sig.id === chord.signature.id) || signatures[0];
					return {
						...chord,
						signature: matchedSignature
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
		} catch (error) {
			console.error('Error saving chords to localStorage:', error);
		}
	}

	// Save the current chord
	function saveCurrentChord() {
		if (activeNotes.length === 0) return; // Don't save empty chords

		const newChord: SavedChord = {
			id: `chord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			notes: [...activeNotes], // Make a copy of the current notes
			signature: currentSignature,
			timestamp: Date.now()
		};

		savedChords = [...savedChords, newChord];
		persistSavedChords();
		console.log('Saved chord:', newChord);
	}

	// Insert a chord at a specific position
	function insertChordAt(index: number) {
		if (activeNotes.length === 0) return; // Don't save empty chords

		const newChord: SavedChord = {
			id: `chord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			notes: [...activeNotes], // Make a copy of the current notes
			signature: currentSignature,
			timestamp: Date.now()
		};

		// Insert at the specified index
		savedChords = [...savedChords.slice(0, index + 1), newChord, ...savedChords.slice(index + 1)];

		persistSavedChords();
	}

	// Delete a chord by ID
	function deleteChord(id: string) {
		savedChords = savedChords.filter((chord) => chord.id !== id);
		persistSavedChords();
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

		// Load saved chords
		loadSavedChords();

		// Set up keyboard listener - only in browser environment
		if (browser) {
			window.addEventListener('keydown', handleKeyDown);
		}

		// Center the keyboard on middle octaves after rendering
		if (browser) {
			setTimeout(() => {
				const pianoContainer = document.querySelector('.piano-container');
				if (pianoContainer) {
					// Calculate middle octave position
					const totalWidth = pianoContainer.scrollWidth;
					const viewportWidth = pianoContainer.clientWidth;
					// Center on octave 4 (middle C)
					const scrollToPosition = (totalWidth - viewportWidth) / 2;
					pianoContainer.scrollLeft = scrollToPosition;
					console.log('Centered keyboard at scroll position:', scrollToPosition);
				}
			}, 100);
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
		activeNotes = [...activeNotes, e.note];
	}

	function handleNoteOff(e: NoteMessageEvent) {
		console.log('Note OFF:', e.note);
		activeNotes = activeNotes.filter(
			(note) => !(note.number === e.note.number && note.octave === e.note.octave)
		);
	}

	function handleInputChange() {
		if (selectedInput) {
			setupMidiListeners();
			console.log('MIDI input changed to:', selectedInput.name);
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
</script>

<div class="container mx-auto p-4">
	<div class="mb-4">
		<h2 class="mb-2 text-xl font-bold">Key Signature</h2>
		<div class="flex flex-wrap gap-2">
			{#each signatures as sig}
				<button
					class="rounded-lg border px-3 py-1 text-sm"
					class:bg-blue-500={currentSignature === sig}
					class:text-white={currentSignature === sig}
					on:click={() => (currentSignature = sig)}
				>
					{sig.id}
				</button>
			{/each}
		</div>
	</div>

	{#if !midiEnabled}
		<div class="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
			<p>{midiError || 'WebMidi is not enabled. Please refresh to try again.'}</p>
		</div>
	{:else}
		<div class="mb-4 flex flex-wrap items-center gap-4">
			<div class="flex-1">
				<label for="midiInput" class="mb-1 block text-sm font-medium text-gray-700">
					MIDI Device
				</label>
				<div class="flex gap-2">
					<select
						id="midiInput"
						class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
						bind:value={selectedInput}
						on:change={handleInputChange}
					>
						<option value={null}>Select a MIDI device</option>
						{#each midiInputs as input}
							<option value={input}>{input.name}</option>
						{/each}
					</select>
					<button
						class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
						on:click={refreshMidiDevices}
						disabled={isInitializing}
					>
						{#if isInitializing}
							Loading...
						{:else}
							Refresh
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="mb-8">
		<Piano notes={activeNotes} on:notePress={handlePianoNotePress} />
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div>
			<h2 class="mb-2 text-xl font-bold">Current Chord</h2>
			<ChordDisplay notes={activeNotes} signature={currentSignature} />
		</div>
		<div>
			<h2 class="mb-2 text-xl font-bold">Sheet Music</h2>
			<SheetMusic notes={activeNotes} signature={currentSignature} />
		</div>
	</div>

	<!-- Chord Riffing UI -->
	<div class="mt-8">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-2xl font-bold">Chord Progression</h2>
			<div class="flex items-center gap-2">
				<button
					class="flex items-center gap-1 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
					on:click={saveCurrentChord}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
						/>
					</svg>
					Save Chord (Space)
				</button>
				<button
					class="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
					on:click={() => {
						savedChords = [];
						persistSavedChords();
					}}
					disabled={savedChords.length === 0}
				>
					Clear All
				</button>
			</div>
		</div>

		<!-- View mode toggle -->
		<div class="mb-4">
			<div class="flex overflow-hidden rounded-lg border">
				<button
					class="flex-1 px-4 py-2 font-medium transition-colors"
					class:bg-blue-500={viewMode === 'keyboard'}
					class:text-white={viewMode === 'keyboard'}
					class:bg-white={viewMode !== 'keyboard'}
					class:text-gray-700={viewMode !== 'keyboard'}
					on:click={() => toggleViewMode('keyboard')}
				>
					<div class="flex items-center justify-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
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
						Keyboard View
					</div>
				</button>
				<button
					class="flex-1 px-4 py-2 font-medium transition-colors"
					class:bg-blue-500={viewMode === 'sheet'}
					class:text-white={viewMode === 'sheet'}
					class:bg-white={viewMode !== 'sheet'}
					class:text-gray-700={viewMode !== 'sheet'}
					on:click={() => toggleViewMode('sheet')}
				>
					<div class="flex items-center justify-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
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
						Sheet Music View
					</div>
				</button>
			</div>
		</div>

		{#if savedChords.length === 0}
			<div class="rounded border border-dashed py-8 text-center text-gray-500">
				<p>No chords saved yet. Hold down piano keys and press Space to save a chord.</p>
			</div>
		{:else}
			<div class="space-y-8">
				{#each savedChords as chord, index}
					<div class="chord-container relative rounded border p-4">
						<!-- Delete button -->
						<button
							class="absolute right-2 top-2 text-red-500 hover:text-red-700"
							on:click={() => deleteChord(chord.id)}
							aria-label="Delete chord"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>

						<!-- Chord key signature info -->
						<div class="mb-2 text-sm text-gray-600">
							Key: <span class="font-medium">{chord.signature.id}</span>
						</div>

						<!-- Piano visualization or Sheet Music based on view mode -->
						{#if viewMode === 'keyboard'}
							<div class="mb-4">
								<Piano notes={chord.notes} readonly={true} />
							</div>
						{:else}
							<div>
								<SheetMusic notes={chord.notes} signature={chord.signature} />
							</div>
						{/if}

						<!-- Insert button - between chords -->
						{#if index < savedChords.length - 1}
							<div class="relative z-10 -mb-4 mt-4 flex justify-center">
								<button
									class="rounded-full bg-green-100 p-1 text-green-800 hover:bg-green-200"
									on:click={() => insertChordAt(index)}
									aria-label="Insert chord here"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-6 w-6"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 6v6m0 0v6m0-6h6m-6 0H6"
										/>
									</svg>
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.chord-container {
		transition: all 0.2s ease;
	}

	.chord-container:hover {
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}
</style>
