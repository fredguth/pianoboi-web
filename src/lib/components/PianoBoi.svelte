<script lang="ts">
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

	onMount(() => {
		initializeWebMidi();
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
		if (noteData.isOn) {
			// Simulate note-on
			const note = {
				name: noteData.name,
				accidental: noteData.accidental,
				octave: noteData.octave,
				number:
					60 +
					noteData.octave * 12 +
					['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(
						noteData.name + (noteData.accidental || '')
					)
			};
			activeNotes = [...activeNotes, note];
			console.log('Piano key press (note-on):', note);
		} else {
			// Simulate note-off
			activeNotes = activeNotes.filter(
				(note) =>
					!(
						note.name === noteData.name &&
						note.accidental === noteData.accidental &&
						note.octave === noteData.octave
					)
			);
			console.log('Piano key release (note-off):', noteData);
		}
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

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h2 class="mb-2 text-xl font-bold">Current Chord</h2>
			<ChordDisplay notes={activeNotes} signature={currentSignature} />
		</div>
		<div>
			<h2 class="mb-2 text-xl font-bold">Sheet Music</h2>
			<SheetMusic notes={activeNotes} signature={currentSignature} />
		</div>
	</div>
</div>
