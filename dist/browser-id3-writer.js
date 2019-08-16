(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.ID3Writer = factory());
}(this, function () { 'use strict';

  // https://encoding.spec.whatwg.org/
  function strToCodePoints(str) {
    return String(str).split('').map(function (c) {
      return c.charCodeAt(0);
    });
  }

  function encodeWindows1252(str) {
    return new Uint8Array(strToCodePoints(str));
  }

  function encodeUtf16le(str) {
    var output = new Uint8Array(str.length * 2);
    new Uint16Array(output.buffer).set(strToCodePoints(str));
    return output;
  }

  function isId3v2(buf) {
    return buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
  }

  function getMimeType(buf) {
    // https://github.com/sindresorhus/file-type
    if (!buf || !buf.length) {
      return null;
    }

    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }

    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return 'image/png';
    }

    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return 'image/gif';
    }

    if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      return 'image/webp';
    }

    var isLeTiff = buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0;
    var isBeTiff = buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0 && buf[3] === 0x2a;

    if (isLeTiff || isBeTiff) {
      return 'image/tiff';
    }

    if (buf[0] === 0x42 && buf[1] === 0x4d) {
      return 'image/bmp';
    }

    if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) {
      return 'image/x-icon';
    }

    return null;
  }

  function uint32ToUint8Array(uint32) {
    var eightBitMask = 0xff;
    return [uint32 >>> 24 & eightBitMask, uint32 >>> 16 & eightBitMask, uint32 >>> 8 & eightBitMask, uint32 & eightBitMask];
  }

  function uint28ToUint7Array(uint28) {
    var sevenBitMask = 0x7f;
    return [uint28 >>> 21 & sevenBitMask, uint28 >>> 14 & sevenBitMask, uint28 >>> 7 & sevenBitMask, uint28 & sevenBitMask];
  }

  function uint7ArrayToUint28(uint7Array) {
    return (uint7Array[0] << 21) + (uint7Array[1] << 14) + (uint7Array[2] << 7) + uint7Array[3];
  }

  function getNumericFrameSize(frameSize) {
    var headerSize = 10;
    var encodingSize = 1;
    return headerSize + encodingSize + frameSize;
  }

  function getStringFrameSize(frameSize) {
    var headerSize = 10;
    var encodingSize = 1;
    var bomSize = 2;
    var frameUtf16Size = frameSize * 2;
    return headerSize + encodingSize + bomSize + frameUtf16Size;
  }

  function getLyricsFrameSize(descriptionSize, lyricsSize) {
    var headerSize = 10;
    var encodingSize = 1;
    var languageSize = 3;
    var bomSize = 2;
    var descriptionUtf16Size = descriptionSize * 2;
    var separatorSize = 2;
    var lyricsUtf16Size = lyricsSize * 2;
    return headerSize + encodingSize + languageSize + bomSize + descriptionUtf16Size + separatorSize + bomSize + lyricsUtf16Size;
  }

  function getPictureFrameSize(pictureSize, mimeTypeSize, descriptionSize, useUnicodeEncoding) {
    var headerSize = 10;
    var encodingSize = 1;
    var separatorSize = 1;
    var pictureTypeSize = 1;
    var bomSize = 2;
    var encodedDescriptionSize = useUnicodeEncoding ? bomSize + (descriptionSize + separatorSize) * 2 : descriptionSize + separatorSize;
    return headerSize + encodingSize + mimeTypeSize + separatorSize + pictureTypeSize + encodedDescriptionSize + pictureSize;
  }

  function getGEOBFrameSize(geobSize, descriptionSize, filenameSize, mimeTypeSize, useUnicodeEncoding) {
    var headerSize = 10;
    var encodingSize = 1;
    var separatorSize = 1;
    var geobTypeSize = 1;
    var bomSize = 2;
    var encodedDescriptionSize = useUnicodeEncoding ? bomSize + (descriptionSize + separatorSize) * 2 : descriptionSize + separatorSize;
    var encodedFilenameSize = useUnicodeEncoding ? bomSize + (filenameSize + separatorSize) * 2 : filenameSize + separatorSize;
    return headerSize + encodingSize + mimeTypeSize + separatorSize + geobTypeSize + encodedDescriptionSize + encodedFilenameSize + geobSize;
  }

  function getCommentFrameSize(descriptionSize, textSize) {
    var headerSize = 10;
    var encodingSize = 1;
    var languageSize = 3;
    var bomSize = 2;
    var descriptionUtf16Size = descriptionSize * 2;
    var separatorSize = 2;
    var textUtf16Size = textSize * 2;
    return headerSize + encodingSize + languageSize + bomSize + descriptionUtf16Size + separatorSize + bomSize + textUtf16Size;
  }

  function getPrivateFrameSize(idSize, dataSize) {
    var headerSize = 10;
    var separatorSize = 1;
    return headerSize + idSize + separatorSize + dataSize;
  }

  function getUserStringFrameSize(descriptionSize, valueSize) {
    var headerSize = 10;
    var encodingSize = 1;
    var bomSize = 2;
    var separatorSize = 2;
    var descriptionUtf16Size = descriptionSize * 2;
    var valueUtf16Size = valueSize * 2;
    return headerSize + encodingSize + bomSize + descriptionUtf16Size + separatorSize + bomSize + valueUtf16Size;
  }

  function getUserUrlLinkFrameSize(descriptionSize, urlSize) {
    var headerSize = 10;
    var encodingSize = 1;
    var bomSize = 2;
    var separatorSize = 2;
    var descriptionUtf16Size = descriptionSize * 2;
    var urlUtf16Size = urlSize * 2;
    return headerSize + encodingSize + bomSize + descriptionUtf16Size + separatorSize + bomSize + urlUtf16Size;
  }

  function getUrlLinkFrameSize(urlSize) {
    var headerSize = 10;
    return headerSize + urlSize;
  }

  var ID3Writer =
  /*#__PURE__*/
  function () {
    var _proto = ID3Writer.prototype;

    _proto._setIntegerFrame = function _setIntegerFrame(name, value) {
      var integer = parseInt(value, 10);
      this.frames.push({
        name: name,
        value: integer,
        size: getNumericFrameSize(integer.toString().length)
      });
    };

    _proto._setStringFrame = function _setStringFrame(name, value) {
      var stringValue = value.toString();
      this.frames.push({
        name: name,
        value: stringValue,
        size: getStringFrameSize(stringValue.length)
      });
    };

    _proto._setPictureFrame = function _setPictureFrame(pictureType, data, description, useUnicodeEncoding) {
      var mimeType = getMimeType(new Uint8Array(data));
      var descriptionString = description.toString();

      if (!mimeType) {
        throw new Error('Unknown APIC MIME type');
      }

      if (!description) {
        useUnicodeEncoding = false;
      }

      this.frames.push({
        name: 'APIC',
        data: data,
        type: pictureType,
        format: mimeType,
        useUnicodeEncoding: useUnicodeEncoding,
        description: descriptionString,
        size: getPictureFrameSize(data.byteLength, mimeType.length, descriptionString.length, useUnicodeEncoding)
      });
    };

    _proto._setGEOBFrame = function _setGEOBFrame(data, description, filename, useUnicodeEncoding) {
      // const mimeType = getMimeType(new Uint8Array(data));
      var mimeType = 'application/json';
      var descriptionString = description.toString();

      if (!description && !filename) {
        useUnicodeEncoding = false;
      }

      this.frames.push({
        name: 'GEOB',
        data: data,
        description: descriptionString,
        filename: filename,
        type: mimeType,
        useUnicodeEncoding: useUnicodeEncoding,
        size: getGEOBFrameSize(data.byteLength, descriptionString.length, filename.length, mimeType.length, useUnicodeEncoding)
      });
    };

    _proto._setLyricsFrame = function _setLyricsFrame(description, lyrics) {
      var descriptionString = description.toString();
      var lyricsString = lyrics.toString();
      this.frames.push({
        name: 'USLT',
        value: lyricsString,
        description: descriptionString,
        size: getLyricsFrameSize(descriptionString.length, lyricsString.length)
      });
    };

    _proto._setCommentFrame = function _setCommentFrame(description, text) {
      var descriptionString = description.toString();
      var textString = text.toString();
      this.frames.push({
        name: 'COMM',
        value: textString,
        description: descriptionString,
        size: getCommentFrameSize(descriptionString.length, textString.length)
      });
    };

    _proto._setPrivateFrame = function _setPrivateFrame(id, data) {
      var identifier = id.toString();
      this.frames.push({
        name: 'PRIV',
        value: data,
        id: identifier,
        size: getPrivateFrameSize(identifier.length, data.byteLength)
      });
    };

    _proto._setUserStringFrame = function _setUserStringFrame(description, value) {
      var descriptionString = description.toString();
      var valueString = value.toString();
      this.frames.push({
        name: 'TXXX',
        description: descriptionString,
        value: valueString,
        size: getUserStringFrameSize(descriptionString.length, valueString.length)
      });
    };

    _proto._setUserUrlLinkFrame = function _setUserUrlLinkFrame(description, url) {
      var descriptionString = description.toString();
      var urlString = url.toString();
      this.frames.push({
        name: 'WXXX',
        description: descriptionString,
        url: urlString,
        size: getUserUrlLinkFrameSize(descriptionString.length, urlString.length)
      });
    };

    _proto._setUrlLinkFrame = function _setUrlLinkFrame(name, url) {
      var urlString = url.toString();
      this.frames.push({
        name: name,
        value: urlString,
        size: getUrlLinkFrameSize(urlString.length)
      });
    };

    function ID3Writer(buffer) {
      if (!buffer || typeof buffer !== 'object' || !('byteLength' in buffer)) {
        throw new Error('First argument should be an instance of ArrayBuffer or Buffer');
      }

      this.arrayBuffer = buffer;
      this.padding = 4096;
      this.frames = [];
      this.url = '';
    }

    _proto.setFrame = function setFrame(frameName, frameValue) {
      switch (frameName) {
        case 'TPE1': // song artists

        case 'TCOM': // song composers

        case 'TCON':
          {
            // song genres
            if (!Array.isArray(frameValue)) {
              throw new Error(frameName + " frame value should be an array of strings");
            }

            var delemiter = frameName === 'TCON' ? ';' : '/';
            var value = frameValue.join(delemiter);

            this._setStringFrame(frameName, value);

            break;
          }

        case 'TIT1': // content group description

        case 'TLAN': // language

        case 'TIT2': // song title

        case 'TALB': // album title

        case 'TPE2': // album artist // spec doesn't say anything about separator, so it is a string, not array

        case 'TPE3': // conductor/performer refinement

        case 'TPE4': // interpreted, remixed, or otherwise modified by

        case 'TRCK': // song number in album: 5 or 5/10

        case 'TPOS': // album disc number: 1 or 1/3

        case 'TMED': // media type

        case 'TPUB': // label name

        case 'TCOP': // copyright

        case 'TKEY': // musical key in which the sound starts

        case 'TEXT': // lyricist / text writer

        case 'TSRC': // isrc

        case 'TENC':
          {
            // encoded by
            this._setStringFrame(frameName, frameValue);

            break;
          }

        case 'TBPM': // beats per minute

        case 'TLEN': // song duration

        case 'TDAT': // album release date expressed as DDMM

        case 'TYER':
          {
            // album release year
            this._setIntegerFrame(frameName, frameValue);

            break;
          }

        case 'USLT':
          {
            // unsychronised lyrics
            if (typeof frameValue !== 'object' || !('description' in frameValue) || !('lyrics' in frameValue)) {
              throw new Error('USLT frame value should be an object with keys description and lyrics');
            }

            this._setLyricsFrame(frameValue.description, frameValue.lyrics);

            break;
          }

        case 'APIC':
          {
            // song cover
            if (typeof frameValue !== 'object' || !('type' in frameValue) || !('data' in frameValue) || !('description' in frameValue)) {
              throw new Error('APIC frame value should be an object with keys type, data and description');
            }

            if (frameValue.type < 0 || frameValue.type > 20) {
              throw new Error('Incorrect APIC frame picture type');
            }

            this._setPictureFrame(frameValue.type, frameValue.data, frameValue.description, frameValue.useUnicodeEncoding);

            break;
          }

        case 'GEOB':
          {
            // general encapsulated object
            break;
          }

        case 'TXXX':
          {
            // user defined text information
            if (typeof frameValue !== 'object' || !('information' in frameValue) || !('value' in frameValue)) {
              throw new Error('TXXX frame value should be an object with keys information and value');
            }

            this._setUserStringFrame(frameValue.information, frameValue.value);

            break;
          }

        case 'WXXX':
          {
            // user defined text information
            if (typeof frameValue !== 'object' || !('description' in frameValue) || !('url' in frameValue)) {
              throw new Error('WXXX frame value should be an object with keys description and url');
            }

            this._setUserUrlLinkFrame(frameValue.description, frameValue.url);

            break;
          }

        case 'WCOM': // Commercial information

        case 'WCOP': // Copyright/Legal information

        case 'WOAF': // Official audio file webpage

        case 'WOAR': // Official artist/performer webpage

        case 'WOAS': // Official audio source webpage

        case 'WORS': // Official internet radio station homepage

        case 'WPAY': // Payment

        case 'WPUB':
          {
            // Publishers official webpage
            this._setUrlLinkFrame(frameName, frameValue);

            break;
          }

        case 'COMM':
          {
            // Comments
            if (typeof frameValue !== 'object' || !('description' in frameValue) || !('text' in frameValue)) {
              throw new Error('COMM frame value should be an object with keys description and text');
            }

            this._setCommentFrame(frameValue.description, frameValue.text);

            break;
          }

        case 'PRIV':
          {
            // Private frame
            if (typeof frameValue !== 'object' || !('owner_identifier' in frameValue || 'id' in frameValue) || !('data' in frameValue)) {
              throw new Error('PRIV frame value should be an object with keys (owner_identifier || id) and data');
            }

            this._setPrivateFrame(frameValue.owner_identifier || frameValue.id, frameValue.data);

            break;
          }

        default:
          {
            throw new Error("Unsupported frame " + frameName);
          }
      }

      return this;
    };

    _proto.removeTag = function removeTag() {
      var headerLength = 10;

      if (this.arrayBuffer.byteLength < headerLength) {
        return;
      }

      var bytes = new Uint8Array(this.arrayBuffer);
      var version = bytes[3];
      var tagSize = uint7ArrayToUint28([bytes[6], bytes[7], bytes[8], bytes[9]]) + headerLength;

      if (!isId3v2(bytes) || version < 2 || version > 4) {
        return;
      }

      this.arrayBuffer = new Uint8Array(bytes.subarray(tagSize)).buffer;
    };

    _proto.addTag = function addTag() {
      this.removeTag();
      var BOM = [0xff, 0xfe];
      var langEng = [0x65, 0x6e, 0x67];
      var headerSize = 10;
      var totalFrameSize = this.frames.reduce(function (sum, frame) {
        return sum + frame.size;
      }, 0);
      var totalTagSize = headerSize + totalFrameSize + this.padding;
      var buffer = new ArrayBuffer(this.arrayBuffer.byteLength + totalTagSize);
      var bufferWriter = new Uint8Array(buffer);
      var offset = 0;
      var writeBytes = [];
      writeBytes = [0x49, 0x44, 0x33, 3]; // ID3 tag and version

      bufferWriter.set(writeBytes, offset);
      offset += writeBytes.length;
      offset++; // version revision

      offset++; // flags

      writeBytes = uint28ToUint7Array(totalTagSize - headerSize); // tag size (without header)

      bufferWriter.set(writeBytes, offset);
      offset += writeBytes.length;
      this.frames.forEach(function (frame) {
        writeBytes = encodeWindows1252(frame.name); // frame name

        bufferWriter.set(writeBytes, offset);
        offset += writeBytes.length;
        writeBytes = uint32ToUint8Array(frame.size - headerSize); // frame size (without header)

        bufferWriter.set(writeBytes, offset);
        offset += writeBytes.length;
        offset += 2; // flags

        switch (frame.name) {
          case 'WCOM':
          case 'WCOP':
          case 'WOAF':
          case 'WOAR':
          case 'WOAS':
          case 'WORS':
          case 'WPAY':
          case 'WPUB':
            {
              writeBytes = encodeWindows1252(frame.value); // URL

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              break;
            }

          case 'TIT1':
          case 'TLAN':
          case 'TPE1':
          case 'TCOM':
          case 'TCON':
          case 'TIT2':
          case 'TALB':
          case 'TPE2':
          case 'TPE3':
          case 'TPE4':
          case 'TRCK':
          case 'TPOS':
          case 'TKEY':
          case 'TMED':
          case 'TPUB':
          case 'TCOP':
          case 'TEXT':
          case 'TSRC':
          case 'TENC':
            {
              writeBytes = [1].concat(BOM); // encoding, BOM

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              writeBytes = encodeUtf16le(frame.value); // frame value

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              break;
            }

          case 'WXXX':
            {
              // description / url
              // todo
              break;
            }

          case 'TXXX': // information / value

          case 'USLT': // description / lyrics

          case 'COMM':
            {
              // description / text
              var frame_first = frame.description || frame.information || '';
              var frame_second = frame.value || frame.lyrics || frame.text || frame.url || '';
              writeBytes = [1]; // encoding

              if (frame.name === 'USLT' || frame.name === 'COMM') {
                writeBytes = writeBytes.concat(langEng); // language
              }

              writeBytes = writeBytes.concat(BOM); // BOM for content descriptor

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              writeBytes = encodeUtf16le(frame_first); // frame value

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              writeBytes = [0, 0].concat(BOM); // separator, BOM for frame value

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              writeBytes = encodeUtf16le(frame_second); // frame value

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              break;
            }

          case 'TBPM':
          case 'TLEN':
          case 'TDAT':
          case 'TYER':
            {
              offset++; // encoding

              writeBytes = encodeWindows1252(frame.value); // frame value

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              break;
            }

          case 'PRIV':
            {
              writeBytes = encodeWindows1252(frame.id); // identifier

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              offset++; // separator

              bufferWriter.set(new Uint8Array(frame.value), offset); // frame data

              offset += frame.value.byteLength;
              break;
            }

          case 'APIC':
            {
              writeBytes = [frame.useUnicodeEncoding ? 1 : 0]; // encoding

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              writeBytes = encodeWindows1252(frame.format); // MIME type

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;
              writeBytes = [0, frame.type]; // separator, pic type

              bufferWriter.set(writeBytes, offset);
              offset += writeBytes.length;

              if (frame.useUnicodeEncoding) {
                writeBytes = [].concat(BOM); // BOM

                bufferWriter.set(writeBytes, offset);
                offset += writeBytes.length;
                writeBytes = encodeUtf16le(frame.description); // description

                bufferWriter.set(writeBytes, offset);
                offset += writeBytes.length;
                offset += 2; // separator
              } else {
                writeBytes = encodeWindows1252(frame.description); // description

                bufferWriter.set(writeBytes, offset);
                offset += writeBytes.length;
                offset++; // separator
              }

              bufferWriter.set(new Uint8Array(frame.data), offset); // picture data

              offset += frame.data.byteLength;
              break;
            }

          case 'GEOB':
            {
              break;
            }
        }
      });
      offset += this.padding; // free space for rewriting

      bufferWriter.set(new Uint8Array(this.arrayBuffer), offset);
      this.arrayBuffer = buffer;
      return buffer;
    };

    _proto.getBlob = function getBlob() {
      return new Blob([this.arrayBuffer], {
        type: 'audio/mpeg'
      });
    };

    _proto.getURL = function getURL() {
      if (!this.url) {
        this.url = URL.createObjectURL(this.getBlob());
      }

      return this.url;
    };

    _proto.revokeURL = function revokeURL() {
      URL.revokeObjectURL(this.url);
    };

    return ID3Writer;
  }();

  return ID3Writer;

}));
