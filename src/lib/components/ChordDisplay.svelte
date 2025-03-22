<script lang="ts">
	import type { Signature } from '$lib/types/signatures';
	import { Chord, Key } from '@tonaljs/tonal';
	import type { Note } from 'webmidi';

	export let notes: Note[] = [];
	export let signature: Signature;

	$: majorChords = Key.majorKey(signature.id).chords;
	$: minorChords = Key.minorKey(signature.id.toLowerCase()).natural.chords;

	// Get note names without octave info
	$: noteNames = notes.map((note) => note.name + (note.accidental || ''));

	// Calculate possible chords based on currently played notes
	$: currentChords = Chord.detect(noteNames);

	// Find if a chord is in the current key
	function isInKey(chord: string): boolean {
		return majorChords.includes(chord) || minorChords.includes(chord);
	}
</script>

<div class="mt-6 w-full">
	<div class="rounded-lg bg-gray-50 p-4">
		<h3 class="mb-2 text-lg font-semibold text-gray-800">Chord Detection</h3>

		{#if notes.length === 0}
			<p class="text-gray-500">Play notes to detect chords</p>
		{:else if currentChords.length === 0}
			<p class="text-gray-500">No recognized chord</p>
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

		<div class="mt-4">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<h4 class="mb-1 text-sm font-medium text-gray-700">Major Key Chords</h4>
					<div class="flex flex-wrap gap-1">
						{#each majorChords as chord}
							<span class="rounded bg-gray-200 px-2 py-0.5 text-xs">
								{chord}
							</span>
						{/each}
					</div>
				</div>
				<div>
					<h4 class="mb-1 text-sm font-medium text-gray-700">Minor Key Chords</h4>
					<div class="flex flex-wrap gap-1">
						{#each minorChords as chord}
							<span class="rounded bg-gray-200 px-2 py-0.5 text-xs">
								{chord}
							</span>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
