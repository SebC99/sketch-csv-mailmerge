const sketch = require('sketch')
const DOM = require('sketch/dom')
const dialog = require('@skpm/dialog')
const CSV = require('papaparse')
const fs = require('@skpm/fs')

const CsvMailmerge = () => {
  const selectedArtboards = (page) => {
    return page.layers.filter((layer) => layer.type == 'Artboard' && layer.selected);
  }

  const textLayers = (obj) => {
    return (obj.type == "Text") ? obj : ((obj.type == 'Artboard' || obj.type == "Group") ? obj.layers.flatMap(layer => textLayers(layer)).filter(Boolean) : undefined);
  }

  const extension = (path) => path.split(".").slice(-1)[0];

  const applyToNewArtboard = (line, baseArtboard, index) => {
    const pixelsBetweenArtboards = 50
    const duplicated = baseArtboard.duplicate()
    const indexOffset = index + 1
    const widthOffset = (pixelsBetweenArtboards * indexOffset) + (baseArtboard.frame.width * indexOffset)
    const duplicatedText = textLayers(duplicated)

    if (line.artboard) {
      duplicated.name = line.artboard
    }

    const applyToMatchingTexts = (fn) => (key, val) => {
      const matchingTextLayers = duplicatedText.filter((layer) => layer.text == `{${key}}`);
      matchingTextLayers.forEach((layer) => fn(layer, val));
    }

    const substituteText = (textLayer, val) => {
      textLayer.text = val
    }

    const substituteImg = (textLayer, val) => {
      const parent = textLayer.parent;
      const layerIndex = textLayer.index
      const oldLayer = textLayer.remove()
      let newLayer;
      if (extension(val) == "svg") {
        newLayer = sketch.createLayerFromData(fs.readFileSync(val, 'utf8'), 'svg')
        newLayer.frame = oldLayer.frame;
        newLayer.transform = oldLayer.transform;
      } else {
        newLayer = new DOM.Image({
          image: val,
          frame: oldLayer.frame,
          transform: oldLayer.transform,
        })
      }
      parent.layers.splice(layerIndex, 0, newLayer)
    }

    const applyTextVal = applyToMatchingTexts(substituteText)

    const applyImgVal = applyToMatchingTexts(substituteImg)

    const valIsImg = (val) => {
      const imgExtensions = ['png', 'jpg', 'jpeg', 'svg'];
      const theExtension = extension(val);
      return imgExtensions.includes(theExtension);
    }

    Object.entries(line).forEach(([key, val]) => {
      console.log('Applying "' + val + '" to "{' + key + '}"');
      valIsImg(val) ? applyImgVal(key, val) : applyTextVal(key, val);
    })
    
    duplicated.frame.x += widthOffset

    return duplicated
  }

  const promptForCsv = (cb) => {
    const csvFilePath = dialog.showOpenDialogSync({
      title: 'Choose CSV',
      properties: ['openFile'],
      filters: [
        { name: 'CSV', extensions: ['csv'] },
      ]
    })[0];

    if (!extension(csvFilePath) === '.csv') { return showExtensionError() }

    const csvFile = fs.readFileSync(csvFilePath, 'utf8')
    parseCsv(csvFile, (csv) => {
      cb(csv)
    })
  }

  const parseCsv = (path, cb) => {
    return CSV.parse(path, { header: true, complete: ({ data, errors }) => {
      return cb(data)
    }})
  }

  const showSelectionError = () => {
    sketch.UI.message('You must only select 1 layer')
  }

  const showExtensionError = () => {
    sketch.UI.message('Only CSVs are allowed')
  }

  const run = () => {
    const page = sketch.getSelectedDocument().selectedPage
    const artboards = selectedArtboards(page)

    if (artboards.length === 1) {
      const artboard = artboards[0]
      promptForCsv((rows) => {
        rows.forEach((row, i) => applyToNewArtboard(row, artboard, i));
      })
    } else {
      showSelectionError()
    }
  }

  return {
    run,
  }
}

export default CsvMailmerge().run
