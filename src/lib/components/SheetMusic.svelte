<script lang="ts">
	import type { Signature } from '$lib/types/signatures';
	import { afterUpdate, onMount } from 'svelte';
	import { Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow';
	import type { Note } from 'webmidi';

	export let notes: Note[] = [];
	export let signature: Signature;

	let container: HTMLDivElement;
	let renderer: Renderer;
	let context: any;

	onMount(() => {
		initRenderer();
		renderMusic();
	});

	afterUpdate(() => {
		renderMusic();
	});

	function initRenderer() {
		if (!container) return;

		// Clear any previous content
		container.innerHTML = '';

		// Create VexFlow renderer
		renderer = new Renderer(container, Renderer.Backends.SVG);
		renderer.resize(container.clientWidth, 250);
		context = renderer.getContext();
		context.setFont('Arial', 10);
	}

	// Filter and format notes for a specific clef
	function getNotesForStave(clef: 'treble' | 'bass') {
		if (!notes.length) return [];

		// Sort notes by pitch
		const sortedNotes = [...notes].sort((a, b) => a.number - b.number);

		// Determine which notes go to which clef
		const trebleNotes = sortedNotes.filter((note) => note.octave >= 4);
		const bassNotes = sortedNotes.filter((note) => note.octave < 4);

		const clefNotes = clef === 'treble' ? trebleNotes : bassNotes;
		if (!clefNotes.length) return [];

		// Format notes for VexFlow
		return clefNotes.map((note) => {
			// Convert MIDI note to VexFlow format
			const noteName = note.name.toLowerCase();
			const accidental = note.accidental || '';
			const octave = note.octave.toString();

			// Create VexFlow note
			return new StaveNote({
				clef,
				keys: [`${noteName}${accidental}/${octave}`],
				duration: 'q'
			});
		});
	}

	// Create a rest note for when there are no other notes to display
	function createRestNote(clef: 'treble' | 'bass') {
		// Default rest position based on clef
		const restPosition = clef === 'treble' ? 'b/4' : 'd/3';
		return new StaveNote({
			clef,
			keys: [restPosition],
			duration: 'qr' // quarter rest
		});
	}

	function renderMusic() {
		if (!container || !renderer || !context) return;

		// Clear the canvas
		context.clear();

		// Get width of container for responsive sizing
		const width = container.clientWidth;

		// Create the staves
		const trebleStave = new Stave(10, 10, width - 20);
		const bassStave = new Stave(10, 100, width - 20);

		// Configure the staves
		trebleStave.addClef('treble');
		trebleStave.addKeySignature(signature.id);

		bassStave.addClef('bass');
		bassStave.addKeySignature(signature.id);

		// Draw the staves
		trebleStave.setContext(context).draw();
		bassStave.setContext(context).draw();

		// Add a connector line between the staves
		const connector = new StaveConnector(trebleStave, bassStave);
		connector.setType(StaveConnector.type.BRACE);
		connector.setContext(context).draw();

		// Get formatted notes for each clef
		let trebleNotes = getNotesForStave('treble');
		let bassNotes = getNotesForStave('bass');

		// Ensure we have at least one note (rest) for each voice
		if (trebleNotes.length === 0) {
			trebleNotes = [createRestNote('treble')];
		}

		if (bassNotes.length === 0) {
			bassNotes = [createRestNote('bass')];
		}

		// Make sure we have at least 4 notes/rests for a 4/4 measure
		while (trebleNotes.length < 4) {
			trebleNotes.push(createRestNote('treble'));
		}

		while (bassNotes.length < 4) {
			bassNotes.push(createRestNote('bass'));
		}

		// Create and draw the treble voice
		const trebleVoice = new Voice({
			numBeats: 4,
			beatValue: 4
		});
		trebleVoice.addTickables(trebleNotes);

		new Formatter().joinVoices([trebleVoice]).format([trebleVoice], width - 60);

		trebleVoice.draw(context, trebleStave);

		// Create and draw the bass voice
		const bassVoice = new Voice({
			numBeats: 4,
			beatValue: 4
		});
		bassVoice.addTickables(bassNotes);

		new Formatter().joinVoices([bassVoice]).format([bassVoice], width - 60);

		bassVoice.draw(context, bassStave);
	}
</script>

<div class="sheet-music w-full" bind:this={container}></div>

<style>
	.sheet-music {
		min-height: 250px;
		background: white;
		border-radius: 4px;
		overflow: hidden;
	}
</style>
