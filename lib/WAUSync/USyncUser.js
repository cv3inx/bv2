export class USyncUser {
    withId(id) {
        this.id = id;
        return this;
    }
    withLid(lid) {
        this.lid = lid;
        return this;
    }
    withPhone(phone) {
        this.phone = phone;
        return this;
    }
    withUsername(username) {
        this.username = username;
        return this;
    }
    withUsernameKey(usernameKey) {
        this.usernameKey = usernameKey;
        return this;
    }
    withType(type) {
        this.type = type;
        return this;
    }
    withPersonaId(personaId) {
        this.personaId = personaId;
        return this;
    }
    /** currently-known profile picture id, so the server can skip unchanged pictures */
    withPictureId(pictureId) {
        this.pictureId = pictureId;
        return this;
    }
    withVerifiedNameSerial(verifiedNameSerial) {
        this.verifiedNameSerial = verifiedNameSerial;
        return this;
    }
    withBusinessProfileTag(businessProfileTag) {
        this.businessProfileTag = businessProfileTag;
        return this;
    }
    withSidelistDelete(sidelistDelete = true) {
        this.sidelistDelete = sidelistDelete;
        return this;
    }
}
//# sourceMappingURL=USyncUser.js.map