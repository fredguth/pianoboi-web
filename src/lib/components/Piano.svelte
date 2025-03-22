<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Note } from 'webmidi';

	export let notes: Note[] = [];
	export let octaveRange = { min: 3, max: 5 };

	const dispatch = createEventDispatcher();
	const whiteKeyWidth = 40; // Base width for calculations

	// Function to determine if key is black
	function isBlackKey(note: string) {
		return note.includes('#') || note.includes('b');
	}

	// Generate all keys in range
	function generateKeys() {
		const keys = [];
		const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

		for (let octave = octaveRange.min; octave <= octaveRange.max; octave++) {
			for (const noteName of noteNames) {
				keys.push({ name: noteName, octave });
			}
		}

		return keys;
	}

	$: allKeys = generateKeys();
	$: whiteKeys = allKeys.filter((key) => !isBlackKey(key.name));
	$: blackKeys = allKeys.filter((key) => isBlackKey(key.name));

	// Find if note is currently pressed
	function isNotePressed(keyName: string, keyOctave: number) {
		return notes.some((note) => {
			const noteName = note.name + (note.accidental || '');
			return noteName === keyName && note.octave === keyOctave;
		});
	}

	// When user clicks a piano key
	function triggerNote(keyName: string, octave: number, isOn: boolean) {
		// Send an event up to parent to simulate MIDI input
		dispatch('notePress', {
			name: keyName.replace('#', '').replace('b', ''),
			accidental: keyName.includes('#') ? '#' : keyName.includes('b') ? 'b' : '',
			octave: octave,
			isOn: isOn
		});

		console.log(`${isOn ? 'Pressed' : 'Released'} key: ${keyName}${octave}`);
	}
</script>

<div class="piano-container w-full overflow-x-auto">
	<div
		class="piano relative"
		style="--white-key-width: {whiteKeyWidth}px; min-width: {whiteKeys.length *
			whiteKeyWidth}px; height: 140px;"
	>
		<!-- White keys first -->
		{#each whiteKeys as key, i}
			<button
				class="absolute bottom-0 rounded-b border border-gray-300 bg-white hover:bg-blue-100 focus:outline-none active:bg-blue-200"
				class:bg-blue-200={isNotePressed(key.name, key.octave)}
				style="
					width: var(--white-key-width); 
					height: 100%;
					left: {i * whiteKeyWidth}px;
				"
				aria-label="{key.name}{key.octave}"
				on:mousedown={() => triggerNote(key.name, key.octave, true)}
				on:mouseup={() => triggerNote(key.name, key.octave, false)}
				on:mouseleave={() => triggerNote(key.name, key.octave, false)}
				on:touchstart|preventDefault={() => triggerNote(key.name, key.octave, true)}
				on:touchend|preventDefault={() => triggerNote(key.name, key.octave, false)}
			>
				<span class="absolute bottom-2 left-1/2 -translate-x-1/2 transform text-xs text-gray-500">
					{key.name}{key.octave}
				</span>
			</button>
		{/each}

		<!-- Black keys on top -->
		{#each blackKeys as key}
			{#if key.name.includes('#')}
				{@const whiteKeyIndex = whiteKeys.findIndex(
					(k) => k.name === key.name.replace('#', '') && k.octave === key.octave
				)}
				{@const position = whiteKeyIndex * whiteKeyWidth + whiteKeyWidth * 0.65}

				<button
					class="absolute z-10 rounded-b border border-gray-800 bg-gray-800 hover:bg-gray-700 focus:outline-none active:bg-blue-500"
					class:bg-blue-500={isNotePressed(key.name, key.octave)}
					style="
						width: calc(var(--white-key-width) * 0.7);
						height: 70px; 
						top: 0;
						left: {position}px;
					"
					aria-label="{key.name}{key.octave}"
					on:mousedown={() => triggerNote(key.name, key.octave, true)}
					on:mouseup={() => triggerNote(key.name, key.octave, false)}
					on:mouseleave={() => triggerNote(key.name, key.octave, false)}
					on:touchstart|preventDefault={() => triggerNote(key.name, key.octave, true)}
					on:touchend|preventDefault={() => triggerNote(key.name, key.octave, false)}
				>
					<span class="absolute bottom-1 left-1/2 -translate-x-1/2 transform text-xs text-white">
						{key.name}{key.octave}
					</span>
				</button>
			{/if}
		{/each}
	</div>
</div>

<style>
	/* Mobile responsiveness */
	@media (max-width: 768px) {
		:global(.piano-container) {
			overflow-x: auto;
		}
	}
</style>
