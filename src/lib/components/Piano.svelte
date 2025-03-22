<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Note } from 'webmidi';

	export let notes: Note[] = [];
	export let readonly = false; // Add readonly prop to disable interaction

	// For dispatching note events to parent
	const dispatch = createEventDispatcher();

	// State
	let activeKeys: string[] = [];
	let container: HTMLDivElement;

	// Update active keys when notes change
	$: {
		if (notes) {
			activeKeys = notes.map(
				(note) => `${note.name.toLowerCase()}${note.accidental || ''}${note.octave}`
			);
		}
	}

	// Build keys for all octaves
	const octaves = [1, 2, 3, 4, 5, 6, 7]; // Extended range C1-B7
	const naturalKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const sharpKeys = ['C#', 'D#', 'F#', 'G#', 'A#'];

	function handleNotePress(note: string, accidental: string, octave: number, isOn: boolean) {
		if (readonly) return; // Ignore if in readonly mode

		console.log('Note press:', note, accidental, octave, isOn);
		dispatch('notePress', {
			name: note,
			accidental,
			octave,
			isOn
		});
	}

	function handleMouseDown(event: MouseEvent, note: string, accidental: string, octave: number) {
		if (readonly) return; // Ignore if in readonly mode

		// Add focus to ensure we get blur events
		const target = event.currentTarget as HTMLDivElement;
		target.focus();

		handleNotePress(note, accidental, octave, true);
	}

	function handleMouseUp(event: MouseEvent, note: string, accidental: string, octave: number) {
		if (readonly) return; // Ignore if in readonly mode

		handleNotePress(note, accidental, octave, false);
	}

	function handleMouseLeave(event: MouseEvent, note: string, accidental: string, octave: number) {
		if (readonly) return; // Ignore if in readonly mode

		// Only turn off if the button was already pressed
		const keyId = `${note.toLowerCase()}${accidental}${octave}`;
		if (activeKeys.includes(keyId)) {
			handleNotePress(note, accidental, octave, false);
		}
	}

	// Calculate relative key width based on piano width
	function getKeyWidth() {
		// Let's make white keys slightly narrower for more compact display
		return '1.8rem'; // Fixed width for consistency
	}
</script>

<div class="piano-wrapper w-full overflow-hidden">
	<div
		class="piano-container flex overflow-x-auto pb-4 pt-1"
		bind:this={container}
		class:non-interactive={readonly}
	>
		{#each octaves as octave}
			<div class="octave-container relative flex">
				{#each naturalKeys as note}
					<!-- White key -->
					<div
						class="white-key flex h-32 w-[1.8rem] cursor-pointer items-end justify-center border border-gray-300 bg-white pb-2 text-xs font-semibold text-gray-700"
						class:active={activeKeys.includes(`${note.toLowerCase()}${octave}`)}
						tabindex="0"
						on:mousedown={(e) => handleMouseDown(e, note, '', octave)}
						on:mouseup={(e) => handleMouseUp(e, note, '', octave)}
						on:mouseleave={(e) => handleMouseLeave(e, note, '', octave)}
						on:blur={() => !readonly && handleNotePress(note, '', octave, false)}
					>
						{note}{octave}
					</div>
				{/each}

				<!-- Black keys (positioned over white keys) -->
				{#each sharpKeys as sharpNote}
					{@const baseNote = sharpNote[0]}
					{@const position = naturalKeys.indexOf(baseNote)}
					{@const offset = position === 2 ? position + 1 : position}
					<!-- Black key - positioned absolutely -->
					<div
						class="absolute top-0 z-10 h-20 w-5 cursor-pointer bg-gray-800 text-[0.6rem] font-medium text-white"
						class:active={activeKeys.includes(`${baseNote.toLowerCase()}#${octave}`)}
						style="left: calc({offset} * 1.8rem + 1.25rem); width: 1.1rem;"
						tabindex="0"
						on:mousedown={(e) => handleMouseDown(e, baseNote, '#', octave)}
						on:mouseup={(e) => handleMouseUp(e, baseNote, '#', octave)}
						on:mouseleave={(e) => handleMouseLeave(e, baseNote, '#', octave)}
						on:blur={() => !readonly && handleNotePress(baseNote, '#', octave, false)}
					>
						<span class="absolute bottom-2 left-0 right-0 text-center">{sharpNote}{octave}</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.piano-container {
		/* Smoother scrolling on touch devices */
		-webkit-overflow-scrolling: touch;
		/* Hide scrollbar for cleaner look */
		scrollbar-width: thin;
		scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
	}

	.piano-container::-webkit-scrollbar {
		height: 6px;
	}

	.piano-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.piano-container::-webkit-scrollbar-thumb {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 20px;
	}

	.white-key.active {
		background-color: #e5e7eb;
		border-color: #9ca3af;
	}

	.black-key.active {
		background-color: #4b5563;
	}

	.non-interactive {
		pointer-events: none;
	}

	@media (max-width: 640px) {
		.white-key {
			height: 7rem;
		}
	}
</style>
