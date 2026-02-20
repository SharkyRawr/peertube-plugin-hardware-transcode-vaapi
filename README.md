# Hardware transcoding using VAAPI

This plugin enables hardware-accelerated transcoding profiles using VAAPI on Linux. It should be considered experimental and some tuning may be required for your hardware.

## Profiles and bitrate control

The plugin registers two video encoder profiles:

- `VAAPI H264` (`h264_vaapi`)
- `VAAPI H265` (`hevc_vaapi`)

Both profiles use constrained variable bitrate (VBR):

- target bitrate is set with `-b:v`
- peak bitrate is capped with `-maxrate:v`
- VBV buffer is set with `-bufsize:v`

You can tune VBR burst behavior with plugin setting `VBR maxrate multiplier`.
For example, `1.5` means maxrate is 150% of the target bitrate.

Migration note: the old profile label `vaapi` was renamed to `VAAPI H264`.
If you previously selected `vaapi` explicitly, review profile selection after upgrading.


For more information on vaapi and hardware acceleration:

- https://jellyfin.org/docs/general/administration/hardware-acceleration.html#enabling-hardware-acceleration
- https://wiki.archlinux.org/index.php/Hardware_video_acceleration#Comparison_tables


# Building a compatible docker image

Official docker images do not ship with required libraries for hardware transcode.
You can build your own image with the following Dockerfile:

```Dockerfile
ARG VERSION=v4.2.0
FROM chocobozzz/peertube:${VERSION}-bullseye


# install dependencies for vaapi
RUN 	   apt update \
	&& apt install -y --no-install-recommends wget apt-transport-https \
	&& echo "deb http://deb.debian.org/debian/ $( awk -F'=' '/^VERSION_CODENAME=/{ print $NF }' /etc/os-release ) non-free" | tee /etc/apt/sources.list.d/non-free.list \
	&& apt update \
	&& apt install -y --no-install-recommends vainfo i965-va-driver-shaders \
	&& apt install -y --no-install-recommends python3 \
	&& rm /var/lib/apt/lists/* -fR
```

If you are using a recent Intel CPU (generation 8 and newer), replace `i965-va-driver-shaders` by `intel-media-va-driver-non-free`.


# Running the docker image

In order to access the GPU inside docker, the `docker-compose.yml` should be adapted as follow.
Note that you must find the id of the `render` group on your machine.
You can use `grep render /etc/group | cut -d':' -f3`  to find the id.


```yaml
version: "2"

services:
  peertube:
    # replace image key with
    build:
      context: .
      args:
        VERSION: v5.0.1
    # usual peertube configuration
    # ...

    # add these keys
    group_add:
      - <replace with the id of the render group>
    devices:
      # VAAPI Devices
      - /dev/dri:/dev/dri
```
