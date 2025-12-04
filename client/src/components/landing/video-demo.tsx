export function VideoDemo() {
  return (
    <section id="run-a-demo" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">See ZecFlow in Action</h2>
          <p className="mt-4 text-lg text-zinc-400">
            Watch how easy it is to build private, agentic workflows on Web3.
          </p>
        </div>

        <div className="relative mx-auto max-w-5xl">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#6758c1] to-[#5344ad] rounded-2xl blur opacity-30" />

          <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 aspect-video overflow-hidden shadow-2xl">
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/9irGzKxLiJs"
              title="ZecFlow Builder in Action"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}
