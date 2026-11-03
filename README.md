# Deep learning demos

Interactive browser demos for the lecture *Deep Learning for Vision - Foundations and Applications* (TU Dresden). Each demo is a static page without build step or dependencies: plain HTML, CSS and JavaScript, computing everything in the browser. The pages live in `docs/` (the GitHub Pages source); `scripts/` holds the smoke test and the training script.

Live version: <https://maweigert.github.io/lecture_deep_demos/>

| Folder | Demo | Lecture |
|---|---|---|
| `docs/optimizer/` | Gradient descent, momentum and Adam on two-parameter loss surfaces | 2 |
| `docs/conv_playground/` | Filter playground: one kernel on an image, stride, padding, pooling, Fourier views, shifts | 3 |
| `docs/layer_playground/` | Conv layer playground: RGB input, several filters, parameter counts, receptive fields | 3 |
| `docs/cnn_viewer/` | CNN viewer: all feature maps of small MNIST networks for drawn digits | 3 |

Settings live in the URL hash, so a link reproduces a view, for example `conv_playground/#kernel=sobel_x&image=nuclei`. The index page lists the presets used on the slides; `docs/presets.json` is their source.

## Run locally

The pages load data with `fetch` and ES modules, so they need a web server; opening `docs/index.html` from the file system shows a blank page.

```zsh
make serve   # starts a local server on port 8070 unless one runs there, then opens the index
make stop    # stops that server
```

## Add a demo

- Create `docs/<name>/index.html`; link `../common/demo.css` and import helpers from `../common/demo.js` (URL-hash state, segmented buttons, pixel painting, diverging and grey colormaps, the shared zoom and pan controller, palette)
- Keep data beside the page (images, JSON) and credit sources in the page with author and license
- Register the demo and its presets in `docs/presets.json`
- Run `make check`: it installs Playwright on first use, loads every demo with every preset in headless Chromium and fails on console errors or unpainted pages

## Use from the course slides

The course repository includes this repository as the submodule `demos/`, and each Slidev deck links its `public/demos` folder to `docs/`. Slides link `/demos/<name>/#<preset>` through the `Demo` component, which also accepts a base URL for published decks.

## Retrain the CNN viewer models

`scripts/train_cnn_viewer.py` trains a model given by a short architecture spec on MNIST and writes it into `docs/cnn_viewer/models.json`, replacing a model of the same name. It needs `numpy`, `torch` and the uncompressed MNIST idx files:

```zsh
python scripts/train_cnn_viewer.py --raw_dir data/MNIST/raw
python scripts/train_cnn_viewer.py --raw_dir data/MNIST/raw --name "2 × conv 7×7, GAP" --spec c7x8p3,m2,c7x16p3,g,d10
```

## License

Code under the MIT license (see `LICENSE`). The images in `docs/conv_playground/imgs/` keep their own licenses, credited in `docs/conv_playground/index.html` and in the demo.
