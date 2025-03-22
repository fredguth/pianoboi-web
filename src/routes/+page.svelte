<script lang="ts">
	import PianoBoi from '$lib/components/PianoBoi.svelte';
</script>

<svelte:head>
	<title>PianoBoi - Interactive MIDI Piano</title>
	<meta
		name="description"
		content="Interactive piano with chord detection and sheet music display"
	/>
</svelte:head>

<main class="min-h-screen bg-gray-50">
	<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		<PianoBoi />

		<footer class="mt-16 text-center text-sm text-gray-500">
			<p>Connect a MIDI keyboard to get started. Works in browsers that support WebMIDI.</p>
			<p class="mt-2">Built with SvelteKit and Tailwind CSS</p>
		</footer>
	</div>
</main>
